import { fromZonedTime } from "date-fns-tz";
import { and, eq, gt, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { inChunks, schema, type Db, type Tx } from "@sala/database";
import type { SeatDisputeLiteDto } from "@sala/contracts";
import type { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { localDateOf } from "../common/dates.js";
import { isMissingSchemaError } from "../common/sqlite-errors.js";
import type { StudySessionService } from "../rankings/study-session.service.js";
import type { ForecastService } from "../forecast/forecast.service.js";
import type { SeatWatchService } from "../seat-watch/seat-watch.service.js";
import type { QuietRoomService } from "../quiet-room/quiet-room.service.js";

const SEAT_STATE_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const VISITOR_RETENTION_DAYS = 7;

/** Computes the UTC instant of `room`'s next-or-most-recent daily reset (`daily_reset_time`, local tz) at/around `now`. */
export function resetInstantFor(room: { timezone: string; dailyResetTime: string }, now: Date): Date {
  const localDate = localDateOf(now, room.timezone);
  const naive = `${localDate}T${room.dailyResetTime}:00`;
  return fromZonedTime(naive, room.timezone);
}

/**
 * Daily operational reset (00:00 local time, `rooms.daily_reset_time`): clears the room. Expires every ACTIVE check-in and active observations,
 * and resets every seat to UNKNOWN/0. Idempotent per room via `rooms.last_reset_at`.
 */
export class DailyResetJob {
  constructor(
    private readonly db: Db,
    private readonly realtime: RoomRealtimeGateway,
    private readonly studySessions: StudySessionService,
    /** Pro: nightly occupancy forecast; null in tests that construct the job directly. */
    private readonly forecast: ForecastService | null = null,
    /** Pro: drops expired seat watches after a reset; null in tests that construct the job directly. */
    private readonly seatWatch: SeatWatchService | null = null,
    /** Pro: drops expired quiet-room watches after a reset; null in tests that construct the job directly. */
    private readonly quietRoom: QuietRoomService | null = null,
  ) {}

  /** Scheduler entry point (`daily-reset`, every minute). */
  async tick(): Promise<void> {
    const now = new Date();
    const rooms = this.db.select().from(schema.rooms).where(eq(schema.rooms.active, true)).all();
    let anyReset = false;
    for (const room of rooms) {
      // One failing room must not block the reset of the others.
      try {
        if (await this.runReset(room.id, now)) {
          anyReset = true;
          await this.recomputeForecast(room.id, now);
        }
      } catch (err) {
        console.error(JSON.stringify({ evt: "daily_reset_failed", roomId: room.id, msg: err instanceof Error ? err.message : String(err) }));
      }
    }
    if (anyReset) {
      await this.deleteExpiredSeatWatches(now);
      await this.deleteExpiredQuietWatches(now);
    }
  }

  /** Pro forecast refresh, outside the reset transaction: a failure here never undoes a reset. */
  private async recomputeForecast(roomId: string, now: Date): Promise<void> {
    try {
      await this.forecast?.recomputeRoom(roomId, now);
    } catch (err) {
      if (!isMissingSchemaError(err)) console.error(JSON.stringify({ evt: "forecast_recompute_failed", roomId, msg: err instanceof Error ? err.message : String(err) }));
    }
  }

  private async deleteExpiredSeatWatches(now: Date): Promise<void> {
    try {
      await this.seatWatch?.deleteExpired(now);
    } catch (err) {
      if (!isMissingSchemaError(err)) console.error(JSON.stringify({ evt: "seat_watch_cleanup_failed", msg: err instanceof Error ? err.message : String(err) }));
    }
  }

  private async deleteExpiredQuietWatches(now: Date): Promise<void> {
    try {
      await this.quietRoom?.deleteExpired(now);
    } catch (err) {
      if (!isMissingSchemaError(err)) console.error(JSON.stringify({ evt: "quiet_watch_cleanup_failed", msg: err instanceof Error ? err.message : String(err) }));
    }
  }

  /**
   * Upserts `room_daily_stats` for the operational day ending at `resetInstant` (labelled with its local
   * calendar date). Idempotent per (room, day). Coverage = share of active seats that got at least one
   * check-in or non-admin observation during the day (the 24h before the reset instant).
   */
  private snapshotDailyStats(tx: Tx, room: { id: string; timezone: string }, seatRows: { id: string }[], resetInstant: Date): void {
    const windowStart = new Date(resetInstant.getTime() - 24 * 60 * 60 * 1000);
    const day = localDateOf(new Date(resetInstant.getTime() - 1), room.timezone);
    const roomId = room.id;
    const activeSeatIds = seatRows.map((s) => s.id);

    const checkInUsers = tx
      .select({ userId: schema.checkIns.userId, seatId: schema.checkIns.seatId })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, roomId), gte(schema.checkIns.createdAt, windowStart), lt(schema.checkIns.createdAt, resetInstant)))
      .all();
    const observationUsers = tx
      .select({ userId: schema.seatObservations.userId, seatId: schema.seatObservations.seatId })
      .from(schema.seatObservations)
      .where(
        and(
          eq(schema.seatObservations.roomId, roomId),
          eq(schema.seatObservations.adminOverride, false),
          gte(schema.seatObservations.createdAt, windowStart),
          lt(schema.seatObservations.createdAt, resetInstant),
        ),
      )
      .all();
    // Daily seat coverage: share of active seats with >= 1 check-in or non-admin observation during the day.
    const touched = new Set([...checkInUsers, ...observationUsers].map((r) => r.seatId));
    const freshSeatCoverage = activeSeatIds.length > 0 ? activeSeatIds.filter((id) => touched.has(id)).length / activeSeatIds.length : 0;
    const activeUsers = new Set([...checkInUsers, ...observationUsers].map((r) => r.userId)).size;

    const values = { freshSeatCoverage, checkIns: checkInUsers.length, observations: observationUsers.length, activeUsers };
    tx.insert(schema.roomDailyStats)
      .values({ roomId, day, ...values })
      .onConflictDoUpdate({ target: [schema.roomDailyStats.roomId, schema.roomDailyStats.day], set: values })
      .run();
  }

  /**
   * Runs (or no-ops) the reset for a single room. Exposed for tests. Returns `true` if a reset
   * was actually applied.
   */
  async runReset(roomId: string, now: Date = new Date()): Promise<boolean> {
    const [room] = this.db.select().from(schema.rooms).where(eq(schema.rooms.id, roomId)).limit(1).all();
    if (!room) return false;

    const resetInstant = resetInstantFor(room, now);
    if (now.getTime() < resetInstant.getTime()) return false; // before today's reset time
    if (room.lastResetAt && new Date(room.lastResetAt).getTime() >= resetInstant.getTime()) return false; // already ran today

    const seatRows = this.db
      .select({ id: schema.seats.id })
      .from(schema.seats)
      .where(and(eq(schema.seats.roomId, roomId), eq(schema.seats.active, true)))
      .all();

    const result = this.db.transaction((tx) => {
      // Conditional claim: only one concurrent tick wins the reset for this room+day.
      const claimed = tx
        .update(schema.rooms)
        .set({ lastResetAt: resetInstant, updatedAt: now })
        .where(and(eq(schema.rooms.id, roomId), or(isNull(schema.rooms.lastResetAt), lt(schema.rooms.lastResetAt, resetInstant))))
        .returning({ id: schema.rooms.id })
        .all();
      if (claimed.length === 0) return null; // another tick already reset this room today

      // Snapshot the day that is ending BEFORE anything below clears state.
      this.snapshotDailyStats(tx, room, seatRows, resetInstant);

      // Only touch check-ins/observations that actually predate this reset instant — a tick can
      // run a little late (the job fires every minute, not exactly at the reset time), and anything
      // started/observed after the reset instant belongs to the *new* day and must survive it.
      // One conditional update that returns exactly the rows it closed: a check-in a concurrent
      // checkout/sweep already ended isn't returned, so it's never recorded a second time here.
      const activeCheckIns = tx
        .update(schema.checkIns)
        .set({ status: "EXPIRED", endedAt: now, updatedAt: now })
        .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE"), lt(schema.checkIns.startedAt, resetInstant)))
        .returning()
        .all();

      for (const checkIn of activeCheckIns) {
        this.studySessions.recordFromCheckIn(tx, checkIn, now);
      }

      tx.update(schema.seatObservations)
        .set({ expiresAt: now, updatedAt: now })
        .where(
          and(eq(schema.seatObservations.roomId, roomId), lt(schema.seatObservations.observedAt, resetInstant), gt(schema.seatObservations.expiresAt, now)),
        )
        .run();

      // Retention: seat_state_events is append-only (one row per seat per change), so drop old history.
      tx.delete(schema.seatStateEvents)
        .where(and(eq(schema.seatStateEvents.roomId, roomId), lt(schema.seatStateEvents.createdAt, new Date(now.getTime() - SEAT_STATE_EVENT_RETENTION_MS))))
        .run();

      // Visitor hashes only matter for "today"; keep a week for debugging and drop the rest.
      tx.delete(schema.roomDailyVisitors)
        .where(
          and(
            eq(schema.roomDailyVisitors.roomId, roomId),
            lt(schema.roomDailyVisitors.localDate, localDateOf(new Date(now.getTime() - VISITOR_RETENTION_DAYS * 24 * 60 * 60 * 1000), room.timezone)),
          ),
        )
        .run();

      // Presence grants issued before the reset don't carry over: the new day starts with a fresh fix.
      tx.delete(schema.presenceGrants)
        .where(and(eq(schema.presenceGrants.roomId, roomId), lt(schema.presenceGrants.grantedAt, resetInstant)))
        .run();

      // Daily reset cancels any dispute still voting — it never resolves as absent/present here.
      const cancelledDisputes = tx
        .update(schema.seatDisputes)
        .set({ status: "CANCELLED", resolvedAt: now })
        .where(and(eq(schema.seatDisputes.roomId, roomId), eq(schema.seatDisputes.status, "OPEN"), lt(schema.seatDisputes.openedAt, resetInstant)))
        .returning()
        .all();

      // Seats with a check-in or observation from the new day (a late tick) keep their state.
      const survivingCheckIns = tx
        .select({ seatId: schema.checkIns.seatId })
        .from(schema.checkIns)
        .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE"), gte(schema.checkIns.startedAt, resetInstant)))
        .all();
      const survivingObservations = tx
        .select({ seatId: schema.seatObservations.seatId })
        .from(schema.seatObservations)
        .where(
          and(eq(schema.seatObservations.roomId, roomId), gte(schema.seatObservations.observedAt, resetInstant), gt(schema.seatObservations.expiresAt, now)),
        )
        .all();
      const keep = new Set([...survivingCheckIns, ...survivingObservations].map((r) => r.seatId));

      // Workers Free caps rows_written, so seats already at the reset values (UNKNOWN, 0) are skipped:
      // no upsert, no event. A seat with no row yet still gets one.
      const resetSeatIds = seatRows.filter((s) => !keep.has(s.id)).map((s) => s.id);
      const currentRows = inChunks(resetSeatIds, (part) =>
        tx
          .select({ seatId: schema.seatCurrentState.seatId, status: schema.seatCurrentState.status, confidence: schema.seatCurrentState.confidence })
          .from(schema.seatCurrentState)
          .where(inArray(schema.seatCurrentState.seatId, part))
          .all(),
      );
      const alreadyReset = new Set(currentRows.filter((r) => r.status === "UNKNOWN" && r.confidence === 0).map((r) => r.seatId));

      for (const seat of seatRows) {
        if (keep.has(seat.id) || alreadyReset.has(seat.id)) continue;
        tx.insert(schema.seatCurrentState)
          .values({ seatId: seat.id, status: "UNKNOWN", confidence: 0, sourceSummary: "DAILY_RESET", lastUpdatedAt: now, updatedAt: now })
          .onConflictDoUpdate({
            target: schema.seatCurrentState.seatId,
            set: { status: "UNKNOWN", confidence: 0, sourceSummary: "DAILY_RESET", lastUpdatedAt: now, updatedAt: now },
          })
          .run();
        tx.insert(schema.seatStateEvents)
          .values({
            roomId,
            seatId: seat.id,
            userId: null,
            eventType: "DAILY_RESET",
            oldStatus: null,
            newStatus: "UNKNOWN",
            metadata: null,
            createdAt: now,
          })
          .run();
      }

      return { cancelledDisputes };
    });

    if (!result) return false; // lost the race to another tick — no side effects to emit

    // Emitted after commit, like every other realtime side effect in this codebase — clients use
    // this to clear a dispute banner for a seat rather than leaving it hanging until it "times out".
    for (const dispute of result.cancelledDisputes) {
      const voteRows = this.db
        .select({ vote: schema.seatDisputeVotes.vote, weight: schema.seatDisputeVotes.weight })
        .from(schema.seatDisputeVotes)
        .where(eq(schema.seatDisputeVotes.disputeId, dispute.id))
        .all();
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
