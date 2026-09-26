import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, gte } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { FREE_OBS_MINUTES, OCCUPIED_OBS_MINUTES, type LocationInput } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PresenceService } from "../presence/presence.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { AbusePolicyService } from "../security/abuse-policy.service.js";
import { QrService } from "../qr/qr.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { ApiErrors } from "../common/api-error.js";

const SPREAD_WINDOW_MIN = 10;
/** A QR-verified observation counts for 1.5x its base (reputation) confidence weight. */
const QR_VERIFIED_FACTOR = 1.5;

export interface CreateObservationInput {
  userId: string;
  roomId: string;
  seatId: string;
  status: "FREE" | "OCCUPIED";
  location: LocationInput;
  ip?: string | null;
  /** Optional QR token scanned at the table; invalid/missing tokens are silently ignored. */
  qrToken?: string | null;
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
  ) {}

  async observe(input: CreateObservationInput): Promise<{ roomId: string; changes: SeatStateChange[] }> {
    const [room] = await this.db.select().from(schema.rooms).where(eq(schema.rooms.id, input.roomId)).limit(1);
    if (!room) throw ApiErrors.roomNotFound();

    const presence = this.presence.validate(room, input.location);
    if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, "No pudimos validar tu ubicación.");

    const [seat] = await this.db
      .select()
      .from(schema.seats)
      .where(and(eq(schema.seats.id, input.seatId), eq(schema.seats.roomId, input.roomId), eq(schema.seats.active, true)))
      .limit(1);
    if (!seat) throw ApiErrors.seatNotFound();

    const [ownCheckIn] = await this.db
      .select()
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, input.userId), eq(schema.checkIns.status, "ACTIVE"), eq(schema.checkIns.seatId, input.seatId)))
      .limit(1);
    if (ownCheckIn) throw ApiErrors.ownSeatObservation();

    const now = new Date();
    const windowStart = new Date(now.getTime() - SPREAD_WINDOW_MIN * 60_000);
    const recentSeats = await this.db
      .select({ seatId: schema.seatObservations.seatId })
      .from(schema.seatObservations)
      .where(and(eq(schema.seatObservations.userId, input.userId), gte(schema.seatObservations.createdAt, windowStart)));
    const distinctSeats = new Set(recentSeats.map((r) => r.seatId));
    const { distinctSeatCap } = await this.abusePolicy.observationLimits(input.userId);
    if (distinctSeats.size >= distinctSeatCap && !distinctSeats.has(input.seatId)) {
      await this.securityEvents.record({
        userId: input.userId,
        eventType: "OBSERVATION_SPREAD",
        ip: input.ip,
        metadata: { distinctSeats: distinctSeats.size },
      });
      throw ApiErrors.rateLimited();
    }

    const minutes = input.status === "FREE" ? FREE_OBS_MINUTES : OCCUPIED_OBS_MINUTES;
    const expiresAt = new Date(now.getTime() + minutes * 60_000);

    const qrVerified = await this.qr.isValidForTable(input.qrToken, input.roomId, seat.tableId);
    const reputationWeight = await this.reputation.observationWeight(input.userId);
    const confidenceWeight = reputationWeight * (qrVerified ? QR_VERIFIED_FACTOR : 1);

    await this.db.transaction(async (tx) => {
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
    });

    const changes = await this.roomState.recomputeSeats([input.seatId], {
      roomId: input.roomId,
      now,
      eventType: "OBSERVATION",
      actingUserId: input.userId,
    });

    return { roomId: input.roomId, changes };
  }
}
