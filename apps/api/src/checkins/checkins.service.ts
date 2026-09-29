import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, gt, gte } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { CHECKIN_MINUTES, type CheckInDto, type LocationInput } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PresenceService } from "../presence/presence.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { QrService } from "../qr/qr.service.js";
import { DisputeService } from "../disputes/disputes.service.js";
import { RolesService } from "../users/roles.service.js";
import { ApiErrors } from "../common/api-error.js";
import { computeVerificationExpiresAt } from "./verification.js";

const UNIQUE_VIOLATION = "23505";
const RAPID_TOGGLE_THRESHOLD = 4;
const RAPID_TOGGLE_WINDOW_MIN = 10;

export interface CreateCheckInInput {
  userId: string;
  roomId: string;
  seatId: string;
  location: LocationInput;
  showIdentity: boolean;
  /** Optional QR token scanned at the table; invalid/missing tokens are silently ignored. */
  qrToken?: string | null;
}

@Injectable()
export class CheckInService {
  private readonly logger = new Logger(CheckInService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(SecurityEventService) private readonly securityEvents: SecurityEventService,
    @Inject(StudySessionService) private readonly studySessions: StudySessionService,
    @Inject(QrService) private readonly qr: QrService,
    @Inject(DisputeService) private readonly disputes: DisputeService,
    @Inject(RolesService) private readonly roles: RolesService,
  ) {}

  async getActiveCheckIn(userId: string): Promise<CheckInDto | null> {
    const [row] = await this.db
      .select({ checkIn: schema.checkIns, seatCode: schema.seats.code })
      .from(schema.checkIns)
      .innerJoin(schema.seats, eq(schema.seats.id, schema.checkIns.seatId))
      // A row can still read ACTIVE here if the expiration sweep just hasn't reached it yet —
      // don't hand a check-in that's already past `expires_at` back to the client as live.
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.status, "ACTIVE"), gt(schema.checkIns.expiresAt, new Date())))
      .limit(1);
    if (!row) return null;
    return toDto(row.checkIn, row.seatCode);
  }

  /** Creates (or moves) the caller's active check-in. Returns the changed seats for realtime
   *  emission, plus whether this was a fresh check-in (not a move/refresh) by an ADMIN/MODERATOR —
   *  the caller uses that to trigger the "admin present" room banner + push notification. */
  async checkIn(input: CreateCheckInInput): Promise<{ checkIn: CheckInDto; changes: SeatStateChange[]; adminPresent: boolean }> {
    const [room] = await this.db.select().from(schema.rooms).where(eq(schema.rooms.id, input.roomId)).limit(1);
    if (!room) throw ApiErrors.roomNotFound();

    const presence = this.presence.validate(room, input.location);
    if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, presenceMessage(presence.reason!), presence.details);

    const [seat] = await this.db
      .select()
      .from(schema.seats)
      .where(and(eq(schema.seats.id, input.seatId), eq(schema.seats.roomId, input.roomId), eq(schema.seats.active, true)))
      .limit(1);
    if (!seat) throw ApiErrors.seatNotFound();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHECKIN_MINUTES * 60_000);

    let previousSeatId: string | null = null;
    let previousCheckInId: string | null = null;
    // True once an attempt finds no pre-existing ACTIVE check-in for this user — i.e. this call is
    // a brand-new check-in, not a move to a different seat or a same-seat refresh. Only this case
    // can trigger the "admin present" notification below (moves/extends never do).
    let isFreshCheckIn = false;
    let createdId: string;
    const attempt = async (): Promise<string> => {
      previousSeatId = null;
      previousCheckInId = null;
      isFreshCheckIn = false;
      return this.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(schema.checkIns)
          .where(and(eq(schema.checkIns.userId, input.userId), eq(schema.checkIns.status, "ACTIVE")))
          .limit(1);

        if (!existing) isFreshCheckIn = true;

        if (existing) {
          if (existing.seatId === input.seatId) {
            // Re-checking into the same seat just refreshes the window.
            await tx
              .update(schema.checkIns)
              .set({ expiresAt, updatedAt: now, showIdentity: input.showIdentity, locationAccuracyM: input.location.accuracy })
              .where(eq(schema.checkIns.id, existing.id));
            return existing.id;
          }
          previousSeatId = existing.seatId;
          previousCheckInId = existing.id;
          await tx
            .update(schema.checkIns)
            .set({ status: "COMPLETED", endedAt: now, updatedAt: now })
            .where(eq(schema.checkIns.id, existing.id));
          await this.studySessions.recordFromCheckIn(tx, existing, now);
        }

        const [created] = await tx
          .insert(schema.checkIns)
          .values({
            userId: input.userId,
            roomId: input.roomId,
            seatId: input.seatId,
            status: "ACTIVE",
            showIdentity: input.showIdentity,
            presenceVerified: true,
            locationAccuracyM: input.location.accuracy,
            startedAt: now,
            expiresAt,
          })
          .returning();
        if (!created) throw new Error("Failed to create check-in");
        return created.id;
      });
    };

    try {
      createdId = await attempt();
    } catch (err: unknown) {
      if (!isUniqueViolation(err)) throw err;
      const constraint = uniqueViolationConstraint(err);
      if (constraint === "uq_checkin_active_seat") throw ApiErrors.seatTaken();
      // uq_checkin_active_user: the same user double-submitted a move (e.g. two seat taps in a
      // row) and both transactions raced to complete the old check-in — retry once, then give up.
      try {
        createdId = await attempt();
      } catch (retryErr: unknown) {
        if (isUniqueViolation(retryErr) && uniqueViolationConstraint(retryErr) === "uq_checkin_active_seat") {
          throw ApiErrors.seatTaken();
        }
        throw ApiErrors.validation("Intentá de nuevo.");
      }
    }

    const seatsToRecompute = previousSeatId ? [input.seatId, previousSeatId] : [input.seatId];
    const qrVerified = await this.qr.isValidForTable(input.qrToken, input.roomId, seat.tableId);
    const changes = await this.roomState.recomputeSeats(seatsToRecompute, {
      roomId: input.roomId,
      now,
      eventType: "CHECK_IN",
      actingUserId: input.userId,
      seatMetadata: qrVerified ? { [input.seatId]: { qrVerified: true } } : undefined,
    });

    const [checkInRow] = await this.db.select().from(schema.checkIns).where(eq(schema.checkIns.id, createdId)).limit(1);
    if (!checkInRow) throw new Error("Check-in vanished after creation");

    // Moving away from a seat ends that check-in — resolve any dispute still OPEN against it.
    // A failure here must not turn an otherwise-successful move into a 500.
    if (previousCheckInId) {
      try {
        await this.disputes.resolveForEndedCheckIn(previousCheckInId, now);
      } catch (err) {
        this.logger.error(`Failed to resolve dispute for ended check-in ${previousCheckInId} (move)`, err instanceof Error ? err.stack : String(err));
      }
    }

    await this.flagRapidToggleIfNeeded(input.userId, now);

    const adminPresent = isFreshCheckIn && (await this.roles.hasRole(input.userId, ["ADMIN", "MODERATOR"]));

    return { checkIn: toDto(checkInRow, seat.code), changes, adminPresent };
  }

  /** Records a `SEAT_TOGGLE_RAPID` security event when a user has created >= 4 check-ins in 10 min. */
  private async flagRapidToggleIfNeeded(userId: string, now: Date): Promise<void> {
    const windowStart = new Date(now.getTime() - RAPID_TOGGLE_WINDOW_MIN * 60_000);
    const recent = await this.db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, userId), gte(schema.checkIns.createdAt, windowStart)));
    if (recent.length >= RAPID_TOGGLE_THRESHOLD) {
      await this.securityEvents.record({ userId, eventType: "SEAT_TOGGLE_RAPID", metadata: { count: recent.length } });
    }
  }

  async checkOut(userId: string): Promise<{ roomId: string; changes: SeatStateChange[] } | null> {
    const now = new Date();
    const existing = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.checkIns)
        .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.status, "ACTIVE")))
        .limit(1);
      if (!row) return null;

      await tx
        .update(schema.checkIns)
        .set({ status: "COMPLETED", endedAt: now, updatedAt: now })
        .where(eq(schema.checkIns.id, row.id));
      await this.studySessions.recordFromCheckIn(tx, row, now);
      return row;
    });
    if (!existing) return null;

    const changes = await this.roomState.recomputeSeats([existing.seatId], {
      roomId: existing.roomId,
      now,
      eventType: "CHECK_OUT",
      actingUserId: userId,
    });

    // Ending the check-in resolves any dispute still OPEN against it. A failure here must not
    // turn a committed checkout into a 500.
    try {
      await this.disputes.resolveForEndedCheckIn(existing.id, now);
    } catch (err) {
      this.logger.error(`Failed to resolve dispute for ended check-in ${existing.id} (checkout)`, err instanceof Error ? err.stack : String(err));
    }

    return { roomId: existing.roomId, changes };
  }

  async extend(userId: string, location: LocationInput): Promise<CheckInDto> {
    const now = new Date();
    const [existing] = await this.db
      .select({ checkIn: schema.checkIns, seatCode: schema.seats.code, room: schema.rooms })
      .from(schema.checkIns)
      .innerJoin(schema.seats, eq(schema.seats.id, schema.checkIns.seatId))
      .innerJoin(schema.rooms, eq(schema.rooms.id, schema.checkIns.roomId))
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.status, "ACTIVE"), gt(schema.checkIns.expiresAt, now)))
      .limit(1);
    if (!existing) throw ApiErrors.noActiveCheckIn();

    const presence = this.presence.validate(existing.room, location);
    if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, presenceMessage(presence.reason!), presence.details);

    const expiresAt = new Date(now.getTime() + CHECKIN_MINUTES * 60_000);
    // Conditional on still being ACTIVE (and unexpired) at write time: the expiration sweep may
    // have raced ahead and flipped this row between the read above and this update — if so, the
    // extension must not resurrect a check-in the sweep already closed out.
    const [updated] = await this.db
      .update(schema.checkIns)
      .set({ expiresAt, updatedAt: now, locationAccuracyM: location.accuracy })
      .where(and(eq(schema.checkIns.id, existing.checkIn.id), eq(schema.checkIns.status, "ACTIVE"), gt(schema.checkIns.expiresAt, now)))
      .returning();
    if (!updated) throw ApiErrors.noActiveCheckIn();
    return toDto(updated, existing.seatCode);
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

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code?: string }).code === UNIQUE_VIOLATION) return true;
  const cause = (err as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null && (cause as { code?: string }).code === UNIQUE_VIOLATION;
}

/** Postgres reports the violated constraint's name on the error (or its wrapped `cause`). */
function uniqueViolationConstraint(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const direct = (err as { constraint?: string }).constraint;
  if (direct) return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null) return (cause as { constraint?: string }).constraint;
  return undefined;
}

export function presenceMessage(reason: string): string {
  switch (reason) {
    case "OUTSIDE_GEOFENCE":
      return "Tenés que estar dentro de la sala para hacer esto.";
    case "STALE_LOCATION":
      return "Tu ubicación está desactualizada, volvé a intentarlo.";
    case "POOR_ACCURACY":
      return "La precisión del GPS es muy baja, intentá de nuevo.";
    case "ROOM_NOT_FOUND":
      return "Sala no encontrada.";
    default:
      return "No pudimos validar tu ubicación.";
  }
}
