import { and, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { STUDY_ABSENCE_RELEASE_MS } from "@sala/contracts";
import type { FocusService } from "../focus/focus.service.js";
import { schema, type Db } from "@sala/database";
import { Logger } from "../platform/logger.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { DisputeService } from "../disputes/disputes.service.js";
import type { RoomHours } from "../rooms/room-hours.js";

/** Periodically expires ACTIVE check-ins and recomputes seats whose signals just expired. */
export class ExpirationJob {
  private readonly logger = new Logger(ExpirationJob.name);

  constructor(
    private readonly db: Db,
    private readonly roomState: RoomStateService,
    private readonly realtime: RoomRealtimeGateway,
    private readonly studySessions: StudySessionService,
    private readonly disputes: DisputeService,
    private readonly hours: RoomHours | null = null,
    private readonly focus: FocusService | null = null,
  ) {}

  /** Scheduler entry point (`expiration`, every 30 s). */
  async tick(): Promise<void> {
    await this.runSweep(new Date());
  }

  /** Exposed for tests: runs one sweep against `now` and returns the seats it changed, by room. */
  async runSweep(now: Date = new Date()): Promise<Map<string, SeatStateChange[]>> {
    if (this.hours) {
      // Repair existing stays created before closing-time caps were introduced.
      const active = this.db.select().from(schema.checkIns).where(eq(schema.checkIns.status, "ACTIVE")).all();
      for (const checkIn of active) {
        const window = this.hours.window(checkIn.roomId, new Date(checkIn.startedAt));
        if (!window) continue;
        const limit = window.open ? window.closesAt : new Date(checkIn.startedAt);
        if (checkIn.expiresAt > limit) this.db.update(schema.checkIns).set({ expiresAt: limit })
          .where(and(eq(schema.checkIns.id, checkIn.id), eq(schema.checkIns.status, "ACTIVE"), gt(schema.checkIns.expiresAt, limit))).run();
      }
      const studying = this.db.select().from(schema.studyStatus).where(eq(schema.studyStatus.active, true)).all();
      for (const study of studying) {
        const window = this.hours.window(study.roomId, now);
        if (window && (!window.open || study.updatedAt < window.opensAt)) {
          this.db.update(schema.studyStatus).set({ active: false, updatedAt: now })
            .where(and(eq(schema.studyStatus.userId, study.userId), eq(schema.studyStatus.roomId, study.roomId), eq(schema.studyStatus.active, true))).run();
        }
      }
    }
    const due = or(lte(schema.checkIns.expiresAt, now), sql`exists (select 1 from check_in_monitors m where m.check_in_id = ${schema.checkIns.id} and m.outside_since <= ${+now - STUDY_ABSENCE_RELEASE_MS})`);
    const candidates = this.db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.status, "ACTIVE"), due))
      .all();

    // Expire (and only then act on) the candidates with one conditional update — a concurrent
    // `extend()` may have pushed `expires_at` into the future or moved the check-in off ACTIVE
    // between the select above and this write, and a row the update doesn't return must not be
    // treated as expired (no study session, no dispute resolution, no recompute).
    const expiredCheckIns: {
      id: string;
      seatId: string;
      roomId: string;
      userId: string;
      startedAt: Date;
      expiresAt: Date;
    }[] = [];
    if (candidates.length > 0) {
      this.db.transaction((tx) => {
        const expiredRows = tx
          .update(schema.checkIns)
          .set({ status: "EXPIRED", endedAt: now, updatedAt: now })
          .where(
            and(
              inArray(
                schema.checkIns.id,
                candidates.map((c) => c.id),
              ),
              eq(schema.checkIns.status, "ACTIVE"),
              due,
            ),
          )
          .returning({
            id: schema.checkIns.id,
            seatId: schema.checkIns.seatId,
            roomId: schema.checkIns.roomId,
            userId: schema.checkIns.userId,
            startedAt: schema.checkIns.startedAt,
            expiresAt: schema.checkIns.expiresAt,
          })
          .all();
        for (const expired of expiredRows) {
          expiredCheckIns.push({
            id: expired.id,
            seatId: expired.seatId,
            roomId: expired.roomId,
            userId: expired.userId,
            startedAt: new Date(expired.startedAt),
            expiresAt: new Date(expired.expiresAt),
          });
          this.studySessions.recordFromCheckIn(tx, expired, now);
        }
      });
    }

    // Expiry ends the check-in — resolve any dispute still OPEN against it. One failing dispute
    // must not abort the sweep for every other check-in that already expired.
    for (const checkIn of expiredCheckIns) {
      try {
        if (this.db.select().from(schema.checkInMonitors).where(and(eq(schema.checkInMonitors.checkInId, checkIn.id), sql`${schema.checkInMonitors.outsideSince} is not null`)).get()) this.focus?.pauseForAbsence(checkIn.userId);
        await this.disputes.resolveForEndedCheckIn(checkIn.id, now);
      } catch (err) {
        this.logger.error(`Failed to resolve dispute for expired check-in ${checkIn.id}`, err instanceof Error ? err.stack : String(err));
      }
    }

    const seatsByRoom = new Map<string, Set<string>>();
    for (const row of expiredCheckIns) {
      const set = seatsByRoom.get(row.roomId) ?? new Set<string>();
      set.add(row.seatId);
      seatsByRoom.set(row.roomId, set);
    }

    // Observation expiry has no event to key off (unlike a check-in's `expires_at` sweep above),
    // so instead of guessing a lookback window — which silently misses anything that expired while
    // the job wasn't running — reconcile every active room against what the live map would show
    // right now and recompute exactly the seats that disagree.
    const rooms = this.db.select({ id: schema.rooms.id }).from(schema.rooms).where(eq(schema.rooms.active, true)).all();
    for (const room of rooms) {
      const mismatched = await this.roomState.findMismatchedSeats(room.id, now);
      if (mismatched.length === 0) continue;
      const set = seatsByRoom.get(room.id) ?? new Set<string>();
      for (const seatId of mismatched) set.add(seatId);
      seatsByRoom.set(room.id, set);
    }

    const changesByRoom = new Map<string, SeatStateChange[]>();
    for (const [roomId, seatIds] of seatsByRoom) {
      const changes = this.roomState.recomputeSeats([...seatIds], {
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
