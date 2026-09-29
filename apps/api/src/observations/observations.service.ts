import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, gte, or } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { FREE_OBS_MINUTES, OCCUPIED_OBS_MINUTES, SAVED_OBS_MINUTES, type LocationInput } from "@uns/contracts";
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
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(SecurityEventService) private readonly securityEvents: SecurityEventService,
    @Inject(AbusePolicyService) private readonly abusePolicy: AbusePolicyService,
    @Inject(QrService) private readonly qr: QrService,
    @Inject(ReputationService) private readonly reputation: ReputationService,
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

  async observe(input: CreateObservationInput): Promise<{ roomId: string; changes: SeatStateChange[] }> {
    const room = await this.roomCache.getRoom(this.db, input.roomId);

    const presence = this.presence.validate(room, input.location);
    if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, "No pudimos validar tu ubicación.", presence.details);

    const seat = await this.roomCache.getActiveSeat(this.db, input.roomId, input.seatId);
    if (!seat) throw ApiErrors.seatNotFound();

    const now = new Date();
    const windowStart = new Date(now.getTime() - SPREAD_WINDOW_MIN * 60_000);
    // All the independent reads in one parallel batch; the checks below run in the original order.
    const [activeCheckIns, recentSeats, limits, qrVerified, reputationWeight] = await Promise.all([
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
      this.db
        .select({ seatId: schema.seatObservations.seatId })
        .from(schema.seatObservations)
        .where(and(eq(schema.seatObservations.userId, input.userId), gte(schema.seatObservations.createdAt, windowStart))),
      input.limits ?? this.abusePolicy.observationLimits(input.userId),
      this.qr.isValidForTable(input.qrToken, input.roomId, seat.tableId),
      this.reputation.observationWeight(input.userId),
    ]);

    if (activeCheckIns.some((c) => c.userId === input.userId && c.seatId === input.seatId)) throw ApiErrors.ownSeatObservation();

    if (input.status === "FREE") {
      const seatCheckIn = activeCheckIns.find((c) => c.seatId === input.seatId);
      if (seatCheckIn && isCheckInVerified(seatCheckIn.verifiedAt, seatCheckIn.expiresAt)) {
        throw ApiErrors.seatVerified();
      }
    }

    const distinctSeats = new Set(recentSeats.map((r) => r.seatId));
    const { distinctSeatCap } = limits;
    if (distinctSeats.size >= distinctSeatCap && !distinctSeats.has(input.seatId)) {
      await this.securityEvents.record({
        userId: input.userId,
        eventType: "OBSERVATION_SPREAD",
        ip: input.ip,
        metadata: { distinctSeats: distinctSeats.size },
      });
      throw ApiErrors.rateLimited();
    }

    const minutes = input.status === "FREE" ? FREE_OBS_MINUTES : input.status === "SAVED" ? SAVED_OBS_MINUTES : OCCUPIED_OBS_MINUTES;
    const expiresAt = new Date(now.getTime() + minutes * 60_000);
    const confidenceWeight = reputationWeight * (qrVerified ? QR_VERIFIED_FACTOR : 1);

    // One transaction for the write and the seat-state recompute (a single BEGIN/COMMIT).
    const changes = await this.db.transaction(async (tx) => {
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

      return this.roomState.recomputeSeats([input.seatId], {
        roomId: input.roomId,
        now,
        eventType: "OBSERVATION",
        actingUserId: input.userId,
        tx,
      });
    });

    return { roomId: input.roomId, changes };
  }
}
