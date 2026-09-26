import { Inject, Injectable } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { and, eq, gt, lte } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { DB } from "../database/database.module.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { StudySessionService } from "../rankings/study-session.service.js";

const SWEEP_INTERVAL_MS = 30_000;
// Look back further than the sweep interval so a missed/delayed tick still catches every
// observation that expired since the previous run.
const OBSERVATION_LOOKBACK_MS = 2 * SWEEP_INTERVAL_MS;

/** Periodically expires ACTIVE check-ins and recomputes seats whose signals just expired. */
@Injectable()
export class ExpirationJob {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
    @Inject(StudySessionService) private readonly studySessions: StudySessionService,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async tick(): Promise<void> {
    await this.runSweep(new Date());
  }

  /** Exposed for tests: runs one sweep against `now` and returns the seats it changed, by room. */
  async runSweep(now: Date = new Date()): Promise<Map<string, SeatStateChange[]>> {
    const expiredCheckIns = await this.db
      .select({
        id: schema.checkIns.id,
        seatId: schema.checkIns.seatId,
        roomId: schema.checkIns.roomId,
        userId: schema.checkIns.userId,
        startedAt: schema.checkIns.startedAt,
        expiresAt: schema.checkIns.expiresAt,
      })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.status, "ACTIVE"), lte(schema.checkIns.expiresAt, now)));

    await this.db.transaction(async (tx) => {
      for (const checkIn of expiredCheckIns) {
        await tx
          .update(schema.checkIns)
          .set({ status: "EXPIRED", endedAt: now, updatedAt: now })
          .where(eq(schema.checkIns.id, checkIn.id));
        await this.studySessions.recordFromCheckIn(tx, checkIn, now);
      }
    });

    const recentlyExpiredObservations = await this.db
      .select({ seatId: schema.seatObservations.seatId, roomId: schema.seatObservations.roomId })
      .from(schema.seatObservations)
      .where(
        and(
          lte(schema.seatObservations.expiresAt, now),
          gt(schema.seatObservations.expiresAt, new Date(now.getTime() - OBSERVATION_LOOKBACK_MS)),
        ),
      );

    const seatsByRoom = new Map<string, Set<string>>();
    for (const row of [...expiredCheckIns, ...recentlyExpiredObservations]) {
      const set = seatsByRoom.get(row.roomId) ?? new Set<string>();
      set.add(row.seatId);
      seatsByRoom.set(row.roomId, set);
    }

    const changesByRoom = new Map<string, SeatStateChange[]>();
    for (const [roomId, seatIds] of seatsByRoom) {
      const changes = await this.roomState.recomputeSeats([...seatIds], {
        roomId,
        now,
        eventType: "EXPIRATION_SWEEP",
        actingUserId: null,
      });
      changesByRoom.set(roomId, changes);
      await this.realtime.broadcastSeatChanges(roomId, changes);
    }

    return changesByRoom;
  }
}
