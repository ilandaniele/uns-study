import { and, eq, gt, gte } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { CHECKIN_MINUTES, type CheckInDto, type LocationInput } from "@sala/contracts";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PresenceService, type PresenceGrant } from "../presence/presence.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { QrService } from "../qr/qr.service.js";
import { DisputeService } from "../disputes/disputes.service.js";
import { RolesService } from "../users/roles.service.js";
import { ApiErrors } from "../common/api-error.js";
import { runInBackground } from "../common/background.js";
import { RoomCache } from "../common/cache/room-cache.service.js";
import { Logger } from "../platform/logger.js";
import { computeVerificationExpiresAt } from "./verification.js";
import { isUniqueViolation } from "../common/sqlite-errors.js";

const RAPID_TOGGLE_THRESHOLD = 4;
const RAPID_TOGGLE_WINDOW_MIN = 10;

export interface CreateCheckInInput {
  userId: string;
  roomId: string;
  seatId: string;
  /** GPS fix; optional while the user holds an unexpired presence grant for the room. */
  location?: LocationInput | null;
  /** Presence already enforced for this request (by `assertPresence`); skips a second check. */
  presence?: PresenceGrant | null;
  showIdentity: boolean;
  /** Optional QR token scanned at the table; invalid/missing tokens are silently ignored. */
  qrToken?: string | null;
  /** How long the user will occupy the seat (15..720 min; the router caps non-Pro users at CHECKIN_MINUTES); defaults to CHECKIN_MINUTES. */
  durationMinutes?: number;
}

export class CheckInService {
  private readonly logger = new Logger(CheckInService.name);

  constructor(
    private readonly db: Db,
    private readonly roomState: RoomStateService,
    private readonly presence: PresenceService,
    private readonly securityEvents: SecurityEventService,
    private readonly studySessions: StudySessionService,
    private readonly qr: QrService,
    private readonly disputes: DisputeService,
    private readonly roles: RolesService,
    private readonly roomCache: RoomCache = new RoomCache(),
  ) {}

  async getActiveCheckIn(userId: string): Promise<CheckInDto | null> {
    const row = this.db
      .select({ checkIn: schema.checkIns, seatCode: schema.seats.code })
      .from(schema.checkIns)
      .innerJoin(schema.seats, eq(schema.seats.id, schema.checkIns.seatId))
      // A row can still read ACTIVE here if the expiration sweep just hasn't reached it yet —
      // don't hand a check-in that's already past `expires_at` back to the client as live.
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.status, "ACTIVE"), gt(schema.checkIns.expiresAt, new Date())))
      .limit(1)
      .get();
    if (!row) return null;
    return toDto(row.checkIn, row.seatCode);
  }

  /** Until when the caller's presence grant for the room (id or slug) runs out, or null without an unexpired one. */
  async presenceGrantExpiresAt(userId: string, idOrSlug: string): Promise<Date | null> {
    const room = await this.roomCache.getRoom(this.db, idOrSlug);
    return this.presence.grantExpiresAt(this.db, userId, room.id);
  }

  /**
   * Cheap presence pre-check so a rejected fix never eats into the caller's rate-limit budget.
   * Returns the grant so the router can hand it to the write and presence is checked once.
   */
  async assertPresence(userId: string, roomId: string, location?: LocationInput | null): Promise<PresenceGrant> {
    const room = await this.roomCache.getRoom(this.db, roomId);
    return this.presence.requirePresence(this.db, { userId, room, location });
  }

  /** Creates (or moves) the caller's active check-in. Returns the changed seats for realtime
   *  emission, plus whether this was a fresh check-in (not a move/refresh) by an ADMIN/MODERATOR —
   *  the caller uses that to trigger the "admin present" room banner + push notification. */
  async checkIn(
    input: CreateCheckInInput,
  ): Promise<{ checkIn: CheckInDto; changes: SeatStateChange[]; previousRoom: { roomId: string; changes: SeatStateChange[] } | null; adminPresent: boolean }> {
    // Room + seat come from the in-memory cache (invalidated by geofence/seed writes).
    const room = await this.roomCache.getRoom(this.db, input.roomId);

    await this.presence.requirePresence(this.db, { userId: input.userId, room, location: input.location, already: input.presence });

    const seat = await this.roomCache.getActiveSeat(this.db, input.roomId, input.seatId);
    if (!seat) throw ApiErrors.seatNotFound();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.durationMinutes ?? CHECKIN_MINUTES) * 60_000);

    // External lookups come first: the write below is one synchronous transaction, so nothing in it can await.
    const [qrVerified, isAdmin] = await Promise.all([
      this.qr.isValidForTable(input.qrToken, input.roomId, seat.tableId),
      this.roles.hasRole(input.userId, ["ADMIN", "MODERATOR"]).catch((err: unknown) => {
        this.logger.error("Failed to look up roles for admin-present check", err instanceof Error ? err.stack : String(err));
        return false;
      }),
    ]);

    let written: {
      row: typeof schema.checkIns.$inferSelect;
      changes: SeatStateChange[];
      previousRoom: { roomId: string; changes: SeatStateChange[] } | null;
      previousCheckInId: string | null;
      // True when the user had no ACTIVE check-in — i.e. this call is a brand-new check-in, not a
      // move to a different seat or a same-seat refresh. Only this case can trigger the "admin
      // present" notification below (moves/extends never do).
      isFreshCheckIn: boolean;
    };
    try {
      written = this.db.transaction((tx) => {
        let previousSeatId: string | null = null;
        let previousRoomId: string | null = null;
        let previousCheckInId: string | null = null;
        const existing = tx
          .select()
          .from(schema.checkIns)
          .where(and(eq(schema.checkIns.userId, input.userId), eq(schema.checkIns.status, "ACTIVE")))
          .limit(1)
          .get();

        let row: typeof schema.checkIns.$inferSelect | undefined;
        if (existing && existing.seatId === input.seatId) {
          // Re-checking into the same seat just refreshes the window.
          row = tx
            .update(schema.checkIns)
            .set({
              expiresAt,
              expiryReminderSentAt: null,
              updatedAt: now,
              showIdentity: input.showIdentity,
              ...(input.location ? { locationAccuracyM: input.location.accuracy } : {}),
            })
            .where(eq(schema.checkIns.id, existing.id))
            .returning()
            .get();
          if (!row) throw new Error("Check-in vanished during refresh");
        } else {
          // One ACTIVE check-in per seat: whoever holds it first wins (the partial unique index is only the backstop).
          const holder = tx
            .select({ id: schema.checkIns.id })
            .from(schema.checkIns)
            .where(and(eq(schema.checkIns.seatId, input.seatId), eq(schema.checkIns.status, "ACTIVE")))
            .limit(1)
            .get();
          if (holder) throw ApiErrors.seatTaken();

          if (existing) {
            previousSeatId = existing.seatId;
            previousRoomId = existing.roomId;
            previousCheckInId = existing.id;
            tx.update(schema.checkIns)
              .set({ status: "COMPLETED", endedAt: now, updatedAt: now })
              .where(eq(schema.checkIns.id, existing.id))
              .run();
            this.studySessions.recordFromCheckIn(tx, existing, now);
          }

          row = tx
            .insert(schema.checkIns)
            .values({
              userId: input.userId,
              roomId: input.roomId,
              seatId: input.seatId,
              status: "ACTIVE",
              showIdentity: input.showIdentity,
              presenceVerified: true,
              locationAccuracyM: input.location?.accuracy ?? null,
              startedAt: now,
              expiresAt,
            })
            .returning()
            .get();
          if (!row) throw new Error("Failed to create check-in");

          // The person now seated takes over an admin "ocupado" mark: it ends here, so the seat
          // doesn't keep reading OCCUPIED after they leave.
          tx.update(schema.seatObservations)
            .set({ expiresAt: now, updatedAt: now })
            .where(
              and(
                eq(schema.seatObservations.seatId, input.seatId),
                eq(schema.seatObservations.adminOverride, true),
                gt(schema.seatObservations.expiresAt, now),
              ),
            )
            .run();
        }

        // Same transaction: the seat state can never lag behind the check-in it was derived from.
        // The seat being left may be in another room: recompute it against ITS room, and hand the
        // caller those changes separately so that room's viewers get the broadcast too.
        const crossRoom = previousSeatId !== null && previousRoomId !== input.roomId;
        const changes = this.roomState.recomputeSeats(previousSeatId && !crossRoom ? [input.seatId, previousSeatId] : [input.seatId], {
          roomId: input.roomId,
          now,
          eventType: "CHECK_IN",
          actingUserId: input.userId,
          seatMetadata: qrVerified ? { [input.seatId]: { qrVerified: true } } : undefined,
          tx,
        });
        const previousRoom =
          crossRoom && previousSeatId && previousRoomId
            ? {
                roomId: previousRoomId,
                changes: this.roomState.recomputeSeats([previousSeatId], {
                  roomId: previousRoomId,
                  now,
                  eventType: "CHECK_IN",
                  actingUserId: input.userId,
                  tx,
                }),
              }
            : null;
        return { row, changes, previousRoom, previousCheckInId, isFreshCheckIn: !existing };
      });
    } catch (err: unknown) {
      // Backstop only: the in-transaction checks above already turn these cases into the right error.
      if (isUniqueViolation(err, ["check_ins.seat_id"])) throw ApiErrors.seatTaken();
      if (isUniqueViolation(err, ["check_ins.user_id"])) throw ApiErrors.validation("Intentá de nuevo.");
      throw err;
    }
    const { row: checkInRow, previousRoom, previousCheckInId, isFreshCheckIn } = written;
    let { changes } = written;

    // Moving away from a seat ends that check-in — resolve any dispute still OPEN against it.
    // A failure here must not turn an otherwise-successful move into a 500.
    if (previousCheckInId) {
      try {
        await this.disputes.resolveForEndedCheckIn(previousCheckInId, now);
      } catch (err) {
        this.logger.error(`Failed to resolve dispute for ended check-in ${previousCheckInId} (move)`, err instanceof Error ? err.stack : String(err));
      }
    }

    // A vote still running on the seat without an incumbent (a "guardado" seat asked to free up) is
    // answered by this check-in. Only an open vote keeps the seat from reading OCCUPIED here, so the
    // common case skips the lookup. Best-effort, like the resolution above.
    if (changes.find((c) => c.seatId === input.seatId)?.status !== "OCCUPIED") {
      try {
        const resolved = await this.disputes.resolveForSeatTaken(input.seatId, now);
        const resolvedSeats = new Set(resolved.map((c) => c.seatId));
        changes = [...changes.filter((c) => !resolvedSeats.has(c.seatId)), ...resolved];
      } catch (err) {
        this.logger.error(`Failed to resolve dispute for taken seat ${input.seatId}`, err instanceof Error ? err.stack : String(err));
      }
    }

    // Abuse bookkeeping isn't needed for the response.
    runInBackground(this.logger, "flagRapidToggleIfNeeded", () => this.flagRapidToggleIfNeeded(input.userId, now));

    const adminPresent = isFreshCheckIn && isAdmin;

    return { checkIn: toDto(checkInRow, seat.code), changes, previousRoom, adminPresent };
  }

  /** Records a `SEAT_TOGGLE_RAPID` security event when a user has created >= 4 check-ins in 10 min. */
  private async flagRapidToggleIfNeeded(userId: string, now: Date): Promise<void> {
    const windowStart = new Date(now.getTime() - RAPID_TOGGLE_WINDOW_MIN * 60_000);
    const recent = this.db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, userId), gte(schema.checkIns.createdAt, windowStart)))
      .all();
    if (recent.length >= RAPID_TOGGLE_THRESHOLD) {
      await this.securityEvents.record({ userId, eventType: "SEAT_TOGGLE_RAPID", metadata: { count: recent.length } });
    }
  }

  async checkOut(userId: string): Promise<{ roomId: string; changes: SeatStateChange[] } | null> {
    const now = new Date();
    const ended = this.db.transaction((tx) => {
      const row = tx
        .select()
        .from(schema.checkIns)
        .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.status, "ACTIVE")))
        .limit(1)
        .get();
      if (!row) return null;

      tx.update(schema.checkIns).set({ status: "COMPLETED", endedAt: now, updatedAt: now }).where(eq(schema.checkIns.id, row.id)).run();
      this.studySessions.recordFromCheckIn(tx, row, now);
      // Same transaction: the whole action is atomic.
      const changes = this.roomState.recomputeSeats([row.seatId], {
        roomId: row.roomId,
        now,
        eventType: "CHECK_OUT",
        actingUserId: userId,
        tx,
      });
      return { existing: row, changes };
    });
    if (!ended) return null;
    const { existing, changes } = ended;

    // Ending the check-in resolves any dispute still OPEN against it. A failure here must not
    // turn a committed checkout into a 500.
    try {
      await this.disputes.resolveForEndedCheckIn(existing.id, now);
    } catch (err) {
      this.logger.error(`Failed to resolve dispute for ended check-in ${existing.id} (checkout)`, err instanceof Error ? err.stack : String(err));
    }

    return { roomId: existing.roomId, changes };
  }

  /**
   * Extends the caller's active check-in. Pass `active` (from a `getActiveCheckIn` the caller just
   * did) to skip re-reading it; the conditional UPDATE below still guards against it having ended.
   */
  async extend(
    userId: string,
    location: LocationInput | null | undefined,
    active?: CheckInDto,
    durationMinutes: number = CHECKIN_MINUTES,
    presence?: PresenceGrant | null,
  ): Promise<CheckInDto> {
    const now = new Date();
    const current = active ?? (await this.getActiveCheckIn(userId));
    if (!current) throw ApiErrors.noActiveCheckIn();

    const room = await this.roomCache.getRoom(this.db, current.roomId);
    const grant = await this.presence.requirePresence(this.db, { userId, room, location, already: presence });

    const expiresAt = new Date(now.getTime() + durationMinutes * 60_000);
    // Conditional on still being ACTIVE (and unexpired) at write time: the expiration sweep may
    // have raced ahead and flipped this row between the read above and this update — if so, the
    // extension must not resurrect a check-in the sweep already closed out. Also scoped to the
    // caller, so a stale `active` can never extend someone else's check-in.
    const updated = this.db
      .update(schema.checkIns)
      .set({ expiresAt, expiryReminderSentAt: null, updatedAt: now, ...(location ? { locationAccuracyM: location.accuracy } : {}) })
      .where(
        and(
          eq(schema.checkIns.id, current.id),
          eq(schema.checkIns.userId, userId),
          eq(schema.checkIns.status, "ACTIVE"),
          gt(schema.checkIns.expiresAt, now),
        ),
      )
      .returning()
      .get();
    if (!updated) throw ApiErrors.noActiveCheckIn();
    // "Sigo acá" while the seat is being voted on answers the vote too.
    await this.disputes.respondStillHereIfChallenged(updated.id, userId, grant);
    return toDto(updated, current.seatCode);
  }
}

export function toDto(row: typeof schema.checkIns.$inferSelect, seatCode: string): CheckInDto {
  const verifiedAt = row.verifiedAt ? new Date(row.verifiedAt) : null;
  const expiresAt = new Date(row.expiresAt);
  return {
    id: row.id,
    roomId: row.roomId,
    seatId: row.seatId,
    seatCode,
    status: row.status,
    startedAt: new Date(row.startedAt).toISOString(),
    expiresAt: expiresAt.toISOString(),
    showIdentity: row.showIdentity,
    verifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
    verificationExpiresAt: verifiedAt ? computeVerificationExpiresAt(verifiedAt, expiresAt).toISOString() : null,
  };
}
