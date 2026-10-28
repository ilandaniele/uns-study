import { and, eq, gt, gte, or } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { CHECKIN_MINUTES, FREE_OBS_MINUTES, OCCUPIED_OBS_MINUTES, SAVED_OBS_MINUTES, type LocationInput, type SeatDisputeDto } from "@sala/contracts";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PresenceService, type PresenceGrant } from "../presence/presence.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { AbusePolicyService, type ObservationLimits } from "../security/abuse-policy.service.js";
import { QrService } from "../qr/qr.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { ApiErrors } from "../common/api-error.js";
import type { RoomHours } from "../rooms/room-hours.js";
import { RoomCache } from "../common/cache/room-cache.service.js";
import { runInBackground } from "../common/background.js";
import { Logger } from "../platform/logger.js";
import { NotificationService } from "../notifications/notification.service.js";
import { DisputeService } from "../disputes/disputes.service.js";
import type { CollaborationService } from "../badges/collaboration.service.js";

const SPREAD_WINDOW_MIN = 10;
/** A QR-verified observation counts for 1.5x its base (reputation) confidence weight. */
const QR_VERIFIED_FACTOR = 1.5;
/** Weight of an admin `admin_override` observation: it outweighs any mix of member reports. */
export const ADMIN_OVERRIDE_WEIGHT = 1000;
/** An admin's "Está ocupado" or "Está libre" holds for one standard check-in block. */
export const ADMIN_MARK_MINUTES = CHECKIN_MINUTES;

export interface CreateObservationInput {
  userId: string;
  roomId: string;
  seatId: string;
  status: "FREE" | "OCCUPIED" | "SAVED";
  /** GPS fix; optional while the user holds an unexpired presence grant for the room. */
  location?: LocationInput | null;
  /** Presence already enforced for this request (by `assertPresence`); skips a second check. */
  presence?: PresenceGrant | null;
  ip?: string | null;
  /** Optional QR token scanned at the table; invalid/missing tokens are silently ignored. */
  qrToken?: string | null;
  /** The caller's observation limits if it already loaded them (saves a query). */
  limits?: ObservationLimits;
  /**
   * The caller holds the ADMIN role and reports OCCUPIED or FREE: the report is stored as an
   * `admin_override` (ADMIN_OVERRIDE_WEIGHT, lasting ADMIN_MARK_MINUTES), replaces any earlier admin mark on the seat and skips the distinct-seat spread cap.
   */
  adminMark?: boolean;
}

export class ObservationService {
  private readonly logger = new Logger(ObservationService.name);

  constructor(
    private readonly db: Db,
    private readonly roomState: RoomStateService,
    private readonly presence: PresenceService,
    private readonly securityEvents: SecurityEventService,
    private readonly abusePolicy: AbusePolicyService,
    private readonly qr: QrService,
    private readonly reputation: ReputationService,
    private readonly notifications: NotificationService,
    private readonly disputes: DisputeService,
    private readonly roomCache: RoomCache = new RoomCache(),
    private readonly hours: RoomHours | null = null,
    private readonly collaboration: CollaborationService | null = null,
  ) {}

  /**
   * Validates presence before the caller spends a rate-limit slot, so a weak GPS fix that the
   * user retries doesn't lock them out with "Demasiadas acciones seguidas".
   */
  async assertPresence(userId: string, roomId: string, location: CreateObservationInput["location"]): Promise<PresenceGrant | null> {
    this.hours?.assertOpen(roomId);
    const room = await this.roomCache.findRoom(this.db, roomId);
    if (!room) return null; // observe() reports the missing room with its usual error.
    return this.presence.requirePresence(this.db, { userId, room, location, rejectMessage: "No pudimos validar tu ubicación." });
  }

  /**
   * Records an observation. "Está libre" on a seat someone else holds (another user's active
   * check-in, or a seat that other reports call "guardado" or "ocupado") opens the timed vote instead — or returns the vote
   * already running on the seat — so `dispute` is the vote the reporter should now see, if any.
   */
  async observe(input: CreateObservationInput): Promise<{ roomId: string; changes: SeatStateChange[]; dispute: SeatDisputeDto | null }> {
    const room = await this.roomCache.getRoom(this.db, input.roomId);
    this.hours?.assertOpen(room.id);

    const presence = await this.presence.requirePresence(this.db, {
      userId: input.userId,
      room,
      location: input.location,
      already: input.presence,
      rejectMessage: "No pudimos validar tu ubicación.",
    });

    const seat = await this.roomCache.getActiveSeat(this.db, input.roomId, input.seatId);
    if (!seat) throw ApiErrors.seatNotFound();

    const now = new Date();
    const windowStart = new Date(now.getTime() - SPREAD_WINDOW_MIN * 60_000);
    // The async lookups first, then the database reads right before the checks that use them.
    const [limits, qrVerified, reputationWeight] = await Promise.all([
      input.limits ?? this.abusePolicy.observationLimits(input.userId),
      this.qr.isValidForTable(input.qrToken, input.roomId, seat.tableId),
      this.reputation.observationWeight(input.userId),
    ]);
    // The caller's own active check-in and whoever holds this seat, in a single query.
    const activeCheckIns = this.db
      .select({
        userId: schema.checkIns.userId,
        seatId: schema.checkIns.seatId,
        verifiedAt: schema.checkIns.verifiedAt,
        expiresAt: schema.checkIns.expiresAt,
      })
      .from(schema.checkIns)
      .where(
        and(
          eq(schema.checkIns.status, "ACTIVE"),
          gt(schema.checkIns.expiresAt, now),
          or(eq(schema.checkIns.seatId, input.seatId), eq(schema.checkIns.userId, input.userId)),
        ),
      )
      .all();
    // The seat's state before this report: only "Está libre" needs it (to tell whether it
    // challenges a "guardado" seat or joins a running vote).
    const priorStates =
      input.status === "FREE"
        ? this.db
            .select({ status: schema.seatCurrentState.status, sourceSummary: schema.seatCurrentState.sourceSummary })
            .from(schema.seatCurrentState)
            .where(eq(schema.seatCurrentState.seatId, input.seatId))
            .limit(1)
            .all()
        : [];

    if (activeCheckIns.some((c) => c.userId === input.userId && c.seatId === input.seatId)) throw ApiErrors.ownSeatObservation();

    const adminMark = input.adminMark === true && input.status !== "SAVED";
    const minutes = adminMark
      ? ADMIN_MARK_MINUTES
      : input.status === "FREE"
        ? FREE_OBS_MINUTES
        : input.status === "SAVED"
          ? SAVED_OBS_MINUTES
          : OCCUPIED_OBS_MINUTES;
    const expiresAt = new Date(now.getTime() + minutes * 60_000);
    const confidenceWeight = adminMark ? ADMIN_OVERRIDE_WEIGHT : reputationWeight * (qrVerified ? QR_VERIFIED_FACTOR : 1);

    // One synchronous transaction for the write and the seat-state recompute: it serializes this
    // user's observation writes, so the spread cap below (a read-then-insert) can't be bypassed by
    // concurrent requests that each see a count under the cap.
    const outcome = this.db.transaction((tx) => {
      const recentSeats = tx
        .select({ seatId: schema.seatObservations.seatId })
        .from(schema.seatObservations)
        .where(and(eq(schema.seatObservations.userId, input.userId), gte(schema.seatObservations.createdAt, windowStart)))
        .all();
      const distinctSeats = new Set(recentSeats.map((r) => r.seatId));
      if (!adminMark && distinctSeats.size >= limits.distinctSeatCap && !distinctSeats.has(input.seatId)) {
        return { spread: distinctSeats.size };
      }

      // Duplicate observation by the same user on the same seat replaces the previous one;
      // an admin mark also replaces any earlier admin mark on the seat, whoever made it.
      tx.update(schema.seatObservations)
        .set({ expiresAt: now, updatedAt: now })
        .where(
          and(
            adminMark
              ? or(eq(schema.seatObservations.userId, input.userId), eq(schema.seatObservations.adminOverride, true))
              : eq(schema.seatObservations.userId, input.userId),
            eq(schema.seatObservations.seatId, input.seatId),
            gt(schema.seatObservations.expiresAt, now),
          ),
        )
        .run();

      tx.insert(schema.seatObservations)
        .values({
          userId: input.userId,
          roomId: input.roomId,
          seatId: input.seatId,
          observedStatus: input.status,
          presenceVerified: true,
          qrVerified,
          adminOverride: adminMark,
          confidenceWeight,
          observedAt: now,
          expiresAt,
        })
        .run();

      const changes = this.roomState.recomputeSeats([input.seatId], {
        roomId: input.roomId,
        now,
        eventType: "OBSERVATION",
        actingUserId: input.userId,
        tx,
      });
      return { changes };
    });

    if ("spread" in outcome) {
      await this.securityEvents.record({
        userId: input.userId,
        eventType: "OBSERVATION_SPREAD",
        ip: input.ip,
        metadata: { distinctSeats: outcome.spread },
      });
      throw ApiErrors.rateLimited("Actualizaste muchos lugares distintos. Esperá hasta 10 minutos antes de marcar otro lugar. Verificar que sos una persona no elimina este límite temporal.");
    }
    let { changes } = outcome;
    let dispute: SeatDisputeDto | null = null;
    const holder = activeCheckIns.find((c) => c.seatId === input.seatId && c.userId !== input.userId);
    const observationVote = input.status === "FREE" ? "ABSENT" : input.status === "SAVED" ? "SAVED" : "PRESENT";
    dispute = await this.disputes.findOpenForSeat(input.seatId, input.userId);
    if (dispute) {
      dispute = await this.disputes.vote(dispute.id, input.userId, observationVote, input.location, true);
    }

    if (input.status === "FREE" || (input.status === "SAVED" && holder)) {
      const prior = priorStates[0];
      const after = changes.find((c) => c.seatId === input.seatId)?.status ?? prior?.status;
      // An ABSENT vote on the holder's check-in, or a SAVED vote on a seat that other reports call
      // "guardado"/"ocupado" and this report didn't already turn FREE. The vote starts with the
      // reporter's own "libre" vote, so if nobody else votes the report wins. An admin's "ocupado"
      // mark is not put to a vote.
      const contested = prior?.status === "SAVED" || prior?.status === "OCCUPIED" || after === "UNCERTAIN" || after === "OCCUPIED" || after === "SAVED";
      const kind = holder ? "ABSENT" : contested && after !== "FREE" && !this.hasAdminOccupiedMark(input.seatId, now) ? "SAVED" : null;

      if (prior?.sourceSummary === "DISPUTE") {
        dispute = await this.disputes.findOpenForSeat(input.seatId, input.userId);
      }
      if (!dispute && kind) {
        const opened = await this.disputes.openFromFreeObservation({
          userId: input.userId,
          roomId: input.roomId,
          seatId: input.seatId,
          kind,
          initialVote: observationVote,
          location: input.location,
          // Presence was enforced above for this same request: the vote doesn't check it again.
          presence,
        });
        if (opened) {
          // The vote's recompute ran after this observation's: its state is the current one.
          const openedSeats = new Set(opened.changes.map((c) => c.seatId));
          changes = [...changes.filter((c) => !openedSeats.has(c.seatId)), ...opened.changes];
          dispute = opened.dispute;
        } else {
          // Cooldown, rate limit or a vote that just opened: join the running vote if there is one,
          // otherwise the report stands as a plain observation and the holder is told directly.
          dispute = await this.disputes.findOpenForSeat(input.seatId, input.userId);
          if (!dispute && holder) {
            runInBackground(this.logger, "marked-free push", () =>
              this.notifications.notifySeatChallenged({ userId: holder.userId, roomId: input.roomId, seatId: input.seatId, seatCode: seat.code, reason: "marked-free" }),
            );
          } else if (!dispute) {
            runInBackground(this.logger, "saved challenge push", () =>
              this.disputes.notifySavedObservers(input.roomId, input.seatId, seat.code, input.userId, now),
            );
          }
        }
      } else if (!dispute && prior?.status === "SAVED") {
        // The report outweighed every "guardado": tell whoever saved it that it now reads free.
        runInBackground(this.logger, "saved challenge push", () =>
          this.disputes.notifySavedObservers(input.roomId, input.seatId, seat.code, input.userId, now),
        );
      }
    }

    if (this.collaboration) this.db.transaction(tx => this.collaboration!.record(tx, input.userId, input.roomId, input.seatId, room.timezone, now));
    return { roomId: input.roomId, changes, dispute };
  }

  private hasAdminOccupiedMark(seatId: string, now: Date): boolean {
    const mark = this.db
      .select({ id: schema.seatObservations.id })
      .from(schema.seatObservations)
      .where(
        and(
          eq(schema.seatObservations.seatId, seatId),
          eq(schema.seatObservations.adminOverride, true),
          eq(schema.seatObservations.observedStatus, "OCCUPIED"),
          gt(schema.seatObservations.expiresAt, now),
        ),
      )
      .limit(1)
      .get();
    return mark != null;
  }
}
