import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, gt, gte, or, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { FREE_OBS_MINUTES, OCCUPIED_OBS_MINUTES, SAVED_OBS_MINUTES, type LocationInput, type SeatDisputeDto } from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PresenceService } from "../presence/presence.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { AbusePolicyService, type ObservationLimits } from "../security/abuse-policy.service.js";
import { QrService } from "../qr/qr.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { ApiErrors } from "../common/api-error.js";
import { RoomCache } from "../common/cache/room-cache.service.js";
import { isCheckInVerified } from "../checkins/verification.js";
import { runInBackground } from "../common/background.js";
import { NotificationService } from "../notifications/notification.service.js";
import { DisputeService } from "../disputes/disputes.service.js";

const SPREAD_WINDOW_MIN = 10;
/** A QR-verified observation counts for 1.5x its base (reputation) confidence weight. */
const QR_VERIFIED_FACTOR = 1.5;

export interface CreateObservationInput {
  userId: string;
  roomId: string;
  seatId: string;
  status: "FREE" | "OCCUPIED" | "SAVED";
  location: LocationInput;
  ip?: string | null;
  /** Optional QR token scanned at the table; invalid/missing tokens are silently ignored. */
  qrToken?: string | null;
  /** The caller's observation limits if it already loaded them (saves a query). */
  limits?: ObservationLimits;
}

@Injectable()
export class ObservationService {
  private readonly logger = new Logger(ObservationService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(SecurityEventService) private readonly securityEvents: SecurityEventService,
    @Inject(AbusePolicyService) private readonly abusePolicy: AbusePolicyService,
    @Inject(QrService) private readonly qr: QrService,
    @Inject(ReputationService) private readonly reputation: ReputationService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(DisputeService) private readonly disputes: DisputeService,
    @Inject(RoomCache) private readonly roomCache: RoomCache = new RoomCache(),
  ) {}

  /**
   * Validates presence before the caller spends a rate-limit slot, so a weak GPS fix that the
   * user retries doesn't lock them out with "Demasiadas acciones seguidas".
   */
  async assertPresence(roomId: string, location: CreateObservationInput["location"]): Promise<void> {
    const room = await this.roomCache.findRoom(this.db, roomId);
    if (!room) return; // observe() reports the missing room with its usual error.
    const presence = this.presence.validate(room, location);
    if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, "No pudimos validar tu ubicación.", presence.details);
  }

  /**
   * Records an observation. "Está libre" on a seat someone else holds (another user's active
   * check-in, or a seat that reads "guardado") opens the timed vote instead — or returns the vote
   * already running on the seat — so `dispute` is the vote the reporter should now see, if any.
   */
  async observe(input: CreateObservationInput): Promise<{ roomId: string; changes: SeatStateChange[]; dispute: SeatDisputeDto | null }> {
    const room = await this.roomCache.getRoom(this.db, input.roomId);

    const presence = this.presence.validate(room, input.location);
    if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, "No pudimos validar tu ubicación.", presence.details);

    const seat = await this.roomCache.getActiveSeat(this.db, input.roomId, input.seatId);
    if (!seat) throw ApiErrors.seatNotFound();

    const now = new Date();
    const windowStart = new Date(now.getTime() - SPREAD_WINDOW_MIN * 60_000);
    // All the independent reads in one parallel batch; the checks below run in the original order.
    const [activeCheckIns, limits, qrVerified, reputationWeight, priorStates] = await Promise.all([
      // The caller's own active check-in and whoever holds this seat, in a single query.
      this.db
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
            or(eq(schema.checkIns.seatId, input.seatId), eq(schema.checkIns.userId, input.userId)),
          ),
        ),
      input.limits ?? this.abusePolicy.observationLimits(input.userId),
      this.qr.isValidForTable(input.qrToken, input.roomId, seat.tableId),
      this.reputation.observationWeight(input.userId),
      // The seat's state before this report: only "Está libre" needs it (to tell whether it
      // challenges a "guardado" seat or joins a running vote).
      input.status === "FREE"
        ? this.db
            .select({ status: schema.seatCurrentState.status, sourceSummary: schema.seatCurrentState.sourceSummary })
            .from(schema.seatCurrentState)
            .where(eq(schema.seatCurrentState.seatId, input.seatId))
            .limit(1)
        : Promise.resolve([]),
    ]);

    if (activeCheckIns.some((c) => c.userId === input.userId && c.seatId === input.seatId)) throw ApiErrors.ownSeatObservation();

    if (input.status === "FREE") {
      const seatCheckIn = activeCheckIns.find((c) => c.seatId === input.seatId);
      if (seatCheckIn && isCheckInVerified(seatCheckIn.verifiedAt, seatCheckIn.expiresAt)) {
        throw ApiErrors.seatVerified();
      }
    }

    const minutes = input.status === "FREE" ? FREE_OBS_MINUTES : input.status === "SAVED" ? SAVED_OBS_MINUTES : OCCUPIED_OBS_MINUTES;
    const expiresAt = new Date(now.getTime() + minutes * 60_000);
    const confidenceWeight = reputationWeight * (qrVerified ? QR_VERIFIED_FACTOR : 1);

    // One transaction for the write and the seat-state recompute (a single BEGIN/COMMIT).
    const outcome = await this.db.transaction(async (tx) => {
      // Serialises this user's observation writes so the spread cap below (a read-then-insert)
      // can't be bypassed by concurrent requests that each see a count under the cap.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`observation-user:${input.userId}`}))`);

      const recentSeats = await tx
        .select({ seatId: schema.seatObservations.seatId })
        .from(schema.seatObservations)
        .where(and(eq(schema.seatObservations.userId, input.userId), gte(schema.seatObservations.createdAt, windowStart)));
      const distinctSeats = new Set(recentSeats.map((r) => r.seatId));
      if (distinctSeats.size >= limits.distinctSeatCap && !distinctSeats.has(input.seatId)) {
        return { spread: distinctSeats.size };
      }

      // Duplicate observation by the same user on the same seat replaces the previous one.
      await tx
        .update(schema.seatObservations)
        .set({ expiresAt: now, updatedAt: now })
        .where(
          and(
            eq(schema.seatObservations.userId, input.userId),
            eq(schema.seatObservations.seatId, input.seatId),
            gt(schema.seatObservations.expiresAt, now),
          ),
        );

      await tx.insert(schema.seatObservations).values({
        userId: input.userId,
        roomId: input.roomId,
        seatId: input.seatId,
        observedStatus: input.status,
        presenceVerified: true,
        qrVerified,
        confidenceWeight,
        observedAt: now,
        expiresAt,
      });

      const changes = await this.roomState.recomputeSeats([input.seatId], {
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
      throw ApiErrors.rateLimited();
    }
    let { changes } = outcome;
    let dispute: SeatDisputeDto | null = null;

    if (input.status === "FREE") {
      const holder = activeCheckIns.find((c) => c.seatId === input.seatId && c.userId !== input.userId);
      const prior = priorStates[0];
      const after = changes.find((c) => c.seatId === input.seatId)?.status ?? prior?.status;
      // An ABSENT vote on the holder's check-in, or a SAVED vote on a "guardado" seat that this
      // report didn't already turn FREE (the reporter's own "guardado" was the only one).
      const kind = holder ? "ABSENT" : prior?.status === "SAVED" && after !== "FREE" ? "SAVED" : null;

      if (prior?.sourceSummary === "DISPUTE") {
        dispute = await this.disputes.findOpenForSeat(input.seatId, input.userId);
      }
      if (!dispute && kind) {
        const opened = await this.disputes.openFromFreeObservation({
          userId: input.userId,
          roomId: input.roomId,
          seatId: input.seatId,
          kind,
          location: input.location,
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

    return { roomId: input.roomId, changes, dispute };
  }
}
