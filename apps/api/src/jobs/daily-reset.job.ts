import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { and, eq, gte, isNull, lt, or } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { SeatDisputeLiteDto } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { StudySessionService } from "../rankings/study-session.service.js";

/** Computes the UTC instant of `room`'s next-or-most-recent daily reset (`daily_reset_time`, local tz) at/around `now`. */
export function resetInstantFor(room: { timezone: string; dailyResetTime: string }, now: Date): Date {
  const localDate = format(toZonedTime(now, room.timezone), "yyyy-MM-dd");
  const naive = `${localDate}T${room.dailyResetTime}:00`;
  return fromZonedTime(naive, room.timezone);
}

/**
 * Daily operational reset (~04:00 local time): expires ACTIVE check-ins and active observations,
 * and resets every seat to UNKNOWN/0. Idempotent per room via `rooms.last_reset_at`.
 */
@Injectable()
export class DailyResetJob {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
    @Inject(StudySessionService) private readonly studySessions: StudySessionService,
  ) {}

  @Cron("0 * * * * *") // every minute
  async tick(): Promise<void> {
    const now = new Date();
    const rooms = await this.db.select().from(schema.rooms).where(eq(schema.rooms.active, true));
    for (const room of rooms) {
      await this.runReset(room.id, now);
    }
  }

  /**
   * Upserts `room_daily_stats` for the operational day ending at `resetInstant` (labelled with its local
   * calendar date). Idempotent per (room, day). Coverage = share of active seats that got at least one
   * check-in or non-admin observation during the day (the 24h before the reset instant).
   */
  private async snapshotDailyStats(
    tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
    room: { id: string; timezone: string },
    seatRows: { id: string }[],
    resetInstant: Date,
  ): Promise<void> {
    const windowStart = new Date(resetInstant.getTime() - 24 * 60 * 60 * 1000);
    const day = format(toZonedTime(new Date(resetInstant.getTime() - 1), room.timezone), "yyyy-MM-dd");
    const roomId = room.id;
    const activeSeatIds = seatRows.map((s) => s.id);

    const checkInUsers = await tx
      .select({ userId: schema.checkIns.userId, seatId: schema.checkIns.seatId })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, roomId), gte(schema.checkIns.createdAt, windowStart), lt(schema.checkIns.createdAt, resetInstant)));
    const observationUsers = await tx
      .select({ userId: schema.seatObservations.userId, seatId: schema.seatObservations.seatId })
      .from(schema.seatObservations)
      .where(
        and(
          eq(schema.seatObservations.roomId, roomId),
          eq(schema.seatObservations.adminOverride, false),
          gte(schema.seatObservations.createdAt, windowStart),
          lt(schema.seatObservations.createdAt, resetInstant),
        ),
      );
    // Daily seat coverage: share of active seats with >= 1 check-in or non-admin observation during the day.
    const touched = new Set([...checkInUsers, ...observationUsers].map((r) => r.seatId));
    const freshSeatCoverage = activeSeatIds.length > 0 ? activeSeatIds.filter((id) => touched.has(id)).length / activeSeatIds.length : 0;
    const activeUsers = new Set([...checkInUsers, ...observationUsers].map((r) => r.userId)).size;

    const values = { freshSeatCoverage, checkIns: checkInUsers.length, observations: observationUsers.length, activeUsers };
    await tx
      .insert(schema.roomDailyStats)
      .values({ roomId, day, ...values })
      .onConflictDoUpdate({ target: [schema.roomDailyStats.roomId, schema.roomDailyStats.day], set: values });
  }

  /**
   * Runs (or no-ops) the reset for a single room. Exposed for tests. Returns `true` if a reset
   * was actually applied.
   */
  async runReset(roomId: string, now: Date = new Date()): Promise<boolean> {
    const [room] = await this.db.select().from(schema.rooms).where(eq(schema.rooms.id, roomId)).limit(1);
    if (!room) return false;

    const resetInstant = resetInstantFor(room, now);
    if (now.getTime() < resetInstant.getTime()) return false; // before today's reset time
    if (room.lastResetAt && new Date(room.lastResetAt).getTime() >= resetInstant.getTime()) return false; // already ran today

    const seatRows = await this.db.select({ id: schema.seats.id }).from(schema.seats).where(and(eq(schema.seats.roomId, roomId), eq(schema.seats.active, true)));

    const result = await this.db.transaction(async (tx) => {
      // Conditional claim: only one concurrent instance/tick wins the reset for this room+day.
      const claimed = await tx
        .update(schema.rooms)
        .set({ lastResetAt: resetInstant, updatedAt: now })
        .where(and(eq(schema.rooms.id, roomId), or(isNull(schema.rooms.lastResetAt), lt(schema.rooms.lastResetAt, resetInstant))))
        .returning({ id: schema.rooms.id });
      if (claimed.length === 0) return null; // another instance already reset this room today

      // Snapshot the day that is ending BEFORE anything below clears state.
      await this.snapshotDailyStats(tx, room, seatRows, resetInstant);

      // Only touch check-ins/observations that actually predate this reset instant — a tick can
      // run a little late (the cron fires every minute, not exactly at 04:00), and anything
      // started/observed after the reset instant belongs to the *new* day and must survive it.
      const activeCheckIns = await tx
        .select()
        .from(schema.checkIns)
        .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE"), lt(schema.checkIns.startedAt, resetInstant)));

      await tx
        .update(schema.checkIns)
        .set({ status: "EXPIRED", endedAt: now, updatedAt: now })
        .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE"), lt(schema.checkIns.startedAt, resetInstant)));

      for (const checkIn of activeCheckIns) {
        await this.studySessions.recordFromCheckIn(tx, checkIn, now);
      }

      await tx
        .update(schema.seatObservations)
        .set({ expiresAt: now, updatedAt: now })
        .where(and(eq(schema.seatObservations.roomId, roomId), lt(schema.seatObservations.observedAt, resetInstant)));

      // Daily reset cancels any dispute still voting — it never resolves as absent/present here.
      const cancelledDisputes = await tx
        .update(schema.seatDisputes)
        .set({ status: "CANCELLED", resolvedAt: now })
        .where(and(eq(schema.seatDisputes.roomId, roomId), eq(schema.seatDisputes.status, "OPEN")))
        .returning();

      for (const seat of seatRows) {
        await tx
          .insert(schema.seatCurrentState)
          .values({ seatId: seat.id, status: "UNKNOWN", confidence: 0, sourceSummary: "DAILY_RESET", lastUpdatedAt: now, updatedAt: now })
          .onConflictDoUpdate({
            target: schema.seatCurrentState.seatId,
            set: { status: "UNKNOWN", confidence: 0, sourceSummary: "DAILY_RESET", lastUpdatedAt: now, updatedAt: now },
          });
        await tx.insert(schema.seatStateEvents).values({
          roomId,
          seatId: seat.id,
          userId: null,
          eventType: "DAILY_RESET",
          oldStatus: null,
          newStatus: "UNKNOWN",
          metadata: null,
          createdAt: now,
        });
      }

      return { cancelledDisputes };
    });

    if (!result) return false; // lost the race to another instance — no side effects to emit

    // Emitted after commit, like every other realtime side effect in this codebase — clients use
    // this to clear a dispute banner for a seat rather than leaving it hanging until it "times out".
    for (const dispute of result.cancelledDisputes) {
      const voteRows = await this.db
        .select({ vote: schema.seatDisputeVotes.vote, weight: schema.seatDisputeVotes.weight })
        .from(schema.seatDisputeVotes)
        .where(eq(schema.seatDisputeVotes.disputeId, dispute.id));
      const present = voteRows.filter((v) => v.vote === "PRESENT").reduce((sum, v) => sum + v.weight, 0);
      const absent = voteRows.filter((v) => v.vote === "ABSENT").reduce((sum, v) => sum + v.weight, 0);
      const dto: SeatDisputeLiteDto = {
        id: dispute.id,
        seatId: dispute.seatId,
        kind: dispute.kind,
        status: dispute.status,
        openedAt: new Date(dispute.openedAt).toISOString(),
        closesAt: new Date(dispute.closesAt).toISOString(),
        votes: { present, absent },
      };
      this.realtime.emitDisputeResolved(roomId, dto);
    }
    this.realtime.emitDailyReset(roomId);
    return true;
  }
}
