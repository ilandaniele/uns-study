import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { buildDisputeService, buildNotificationService, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { QrService } from "../qr/qr.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { DisputeService } from "../disputes/disputes.service.js";
import { RolesService } from "../users/roles.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { RecordingHub } from "../realtime/realtime-hub.js";
import { localDateOf } from "../common/dates.js";
import { DailyResetJob, resetInstantFor } from "./daily-reset.job.js";

describe("DailyResetJob", () => {
  let db: Db;
  let checkIns: CheckInService;
  let disputes: DisputeService;
  let gateway: RoomRealtimeGateway;
  let job: DailyResetJob;
  let roomId: string;
  let seatId: string;
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };

  beforeEach(async () => {
    db = freshDb();
    const roomState = new RoomStateService(db);
    const presence = new PresenceService();
    const security = new SecurityEventService(db, new ReputationService(db));
    const studySessions = new StudySessionService(db);
    disputes = buildDisputeService(db);
    checkIns = new CheckInService(db, roomState, presence, security, studySessions, new QrService(db), disputes, new RolesService(db));
    gateway = new RoomRealtimeGateway(new RecordingHub(), roomState, buildNotificationService(db), null);
    job = new DailyResetJob(db, gateway, studySessions);

    const room = await getRoom(db);
    roomId = room.id;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    seatId = (await getSeats(db))[0]!.id;
    await insertUsers(db, ["u1"]);
  });

  it("is a no-op before today's reset time", async () => {
    const room = await getRoom(db);
    const todayResetInstant = resetInstantFor(room, new Date());
    const before = new Date(todayResetInstant.getTime() - 60_000); // 1 minute before 04:00 local
    const ran = await job.runReset(roomId, before);
    expect(ran).toBe(false);
  });

  it("expires active check-ins/observations and resets all seats to UNKNOWN after the reset time", async () => {
    const { checkIn: created } = await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });

    const room = await getRoom(db);
    const after = new Date(resetInstantFor(room, new Date()).getTime() + 60_000); // 1 minute after
    // Back-date the check-in so it predates the (simulated) reset instant regardless of the
    // wall-clock time the test happens to run at — only signals from *before* the reset boundary
    // are supposed to be swept.
    await db.update(schema.checkIns).set({ startedAt: new Date(after.getTime() - 60 * 60_000) }).where(eq(schema.checkIns.id, created.id));

    const ran = await job.runReset(roomId, after);
    expect(ran).toBe(true);

    const [checkIn] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.seatId, seatId));
    expect(checkIn?.status).toBe("EXPIRED");

    const states = await db.select().from(schema.seatCurrentState);
    expect(states).toHaveLength(108);
    expect(states.every((s) => s.status === "UNKNOWN" && s.confidence === 0)).toBe(true);

    const events = await db.select().from(schema.seatStateEvents);
    expect(events.length).toBeGreaterThan(0); // events are kept, not deleted
  });

  it("purges visitor hashes older than a week but keeps recent ones", async () => {
    const room = await getRoom(db);
    const after = new Date(resetInstantFor(room, new Date()).getTime() + 60_000);
    await db.insert(schema.roomDailyVisitors).values([
      { roomId, localDate: "2000-01-01", visitorHash: "old" },
      { roomId, localDate: localDateOf(after, room.timezone), visitorHash: "today" },
    ]);
    expect(await job.runReset(roomId, after)).toBe(true);
    const rows = await db.select().from(schema.roomDailyVisitors);
    expect(rows.map((r) => r.visitorHash)).toEqual(["today"]);
  });

  it("snapshots the ending day into room_daily_stats before clearing state, once per day", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });
    const room = await getRoom(db);
    const resetInstant = resetInstantFor(room, new Date());
    const after = new Date(resetInstant.getTime() + 60_000);
    const earlier = new Date(resetInstant.getTime() - 60 * 60_000);
    await db.update(schema.checkIns).set({ startedAt: earlier, createdAt: earlier }).where(eq(schema.checkIns.id, checkIn.id));

    expect(await job.runReset(roomId, after)).toBe(true);
    const rows = await db.select().from(schema.roomDailyStats).where(eq(schema.roomDailyStats.roomId, roomId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ checkIns: 1, observations: 0, activeUsers: 1 });
    expect(rows[0]!.freshSeatCoverage).toBeCloseTo(1 / 108, 5); // 1 seat touched during the day

    // A second tick the same day is a no-op and leaves exactly one row.
    expect(await job.runReset(roomId, new Date(after.getTime() + 60_000))).toBe(false);
    expect(await db.select().from(schema.roomDailyStats)).toHaveLength(1);
  });

  it("records exactly one study session per active check-in it expires", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });
    const room = await getRoom(db);
    const after = new Date(resetInstantFor(room, new Date()).getTime() + 60_000);
    // Times relative to the simulated reset instant, not wall-clock, so the test is TZ/time-of-day independent.
    await db
      .update(schema.checkIns)
      .set({ startedAt: new Date(after.getTime() - 45 * 60_000), expiresAt: new Date(after.getTime() + 15 * 60_000) })
      .where(eq(schema.checkIns.id, checkIn.id));
    await job.runReset(roomId, after);

    const sessions = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, checkIn.id));
    expect(sessions).toHaveLength(1);
  });

  it("does not expire a check-in started after the reset instant (late cron tick)", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });
    const room = await getRoom(db);
    const resetInstant = resetInstantFor(room, new Date());
    const after = new Date(resetInstant.getTime() + 60_000); // cron fires a minute late
    // Simulates a user checking in *after* the reset boundary but before the tick actually runs.
    await db.update(schema.checkIns).set({ startedAt: new Date(resetInstant.getTime() + 10_000) }).where(eq(schema.checkIns.id, checkIn.id));

    await job.runReset(roomId, after);

    const [row] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.id, checkIn.id));
    expect(row?.status).toBe("ACTIVE");
  });

  it("does not expire an observation observed after the reset instant", async () => {
    const room = await getRoom(db);
    const resetInstant = resetInstantFor(room, new Date());
    const after = new Date(resetInstant.getTime() + 60_000);
    await db.insert(schema.seatObservations).values({
      userId: "u1",
      roomId,
      seatId,
      observedStatus: "FREE",
      presenceVerified: true,
      qrVerified: false,
      confidenceWeight: 1,
      observedAt: new Date(resetInstant.getTime() + 10_000),
      expiresAt: new Date(resetInstant.getTime() + 15 * 60_000),
    });

    await job.runReset(roomId, after);

    const [row] = await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.seatId, seatId));
    expect(row?.expiresAt.getTime()).toBe(new Date(resetInstant.getTime() + 15 * 60_000).getTime());
  });

  it("leaves already-expired observations untouched (only live rows are updated)", async () => {
    const room = await getRoom(db);
    const resetInstant = resetInstantFor(room, new Date());
    const after = new Date(resetInstant.getTime() + 60_000);
    const expiredAt = new Date(resetInstant.getTime() - 30 * 60_000);
    await db.insert(schema.seatObservations).values({
      userId: "u1",
      roomId,
      seatId,
      observedStatus: "FREE",
      presenceVerified: true,
      qrVerified: false,
      confidenceWeight: 1,
      observedAt: new Date(resetInstant.getTime() - 60 * 60_000),
      expiresAt: expiredAt,
    });

    await job.runReset(roomId, after);

    const [row] = await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.seatId, seatId));
    expect(row?.expiresAt.getTime()).toBe(expiredAt.getTime());
  });

  it("clears presence grants issued before the reset instant but keeps ones from the new day", async () => {
    const room = await getRoom(db);
    const after = new Date(resetInstantFor(room, new Date()).getTime() + 60_000);
    await insertUsers(db, ["u2"]);
    await db.insert(schema.presenceGrants).values([
      { userId: "u1", roomId, grantedAt: new Date(after.getTime() - 30 * 60_000), expiresAt: new Date(after.getTime() + 30 * 60_000) },
      { userId: "u2", roomId, grantedAt: after, expiresAt: new Date(after.getTime() + 60 * 60_000) },
    ]);

    await job.runReset(roomId, after);

    const users = (await db.select().from(schema.presenceGrants)).map((g) => g.userId);
    expect(users).toEqual(["u2"]);
  });

  it("deletes seat_state_events older than 90 days but keeps recent ones", async () => {
    const room = await getRoom(db);
    const after = new Date(resetInstantFor(room, new Date()).getTime() + 60_000);
    const base = { roomId, seatId, userId: null, eventType: "TEST", oldStatus: null, newStatus: "UNKNOWN" as const, metadata: null };
    await db.insert(schema.seatStateEvents).values([
      { ...base, eventType: "OLD", createdAt: new Date(after.getTime() - 91 * 24 * 60 * 60_000) },
      { ...base, eventType: "RECENT", createdAt: new Date(after.getTime() - 89 * 24 * 60 * 60_000) },
    ]);

    await job.runReset(roomId, after);

    const types = (await db.select().from(schema.seatStateEvents)).map((e) => e.eventType);
    expect(types).not.toContain("OLD");
    expect(types).toContain("RECENT");
  });

  it("cancels an OPEN dispute and emits seat:dispute-resolved with a CANCELLED payload", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });
    await insertUsers(db, ["u2"]);
    const { dispute } = await disputes.open({ userId: "u2", roomId, seatId, kind: "CLAIM", location });

    const room = await getRoom(db);
    const after = new Date(resetInstantFor(room, new Date()).getTime() + 60_000);
    await db.update(schema.checkIns).set({ startedAt: new Date(after.getTime() - 60 * 60_000) }).where(eq(schema.checkIns.id, checkIn.id));
    await db.update(schema.seatDisputes).set({ openedAt: new Date(after.getTime() - 30 * 60_000) }).where(eq(schema.seatDisputes.id, dispute.id));

    const spy = vi.spyOn(gateway, "emitDisputeResolved");
    await job.runReset(roomId, after);

    expect(spy).toHaveBeenCalledWith(
      roomId,
      expect.objectContaining({ id: dispute.id, seatId, status: "CANCELLED" }),
    );
    spy.mockRestore();
  });

  it("keeps an OPEN dispute opened after the reset instant (late cron tick)", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });
    await insertUsers(db, ["u2"]);
    const { dispute } = await disputes.open({ userId: "u2", roomId, seatId, kind: "CLAIM", location });
    const room = await getRoom(db);
    const resetInstant = resetInstantFor(room, new Date());
    await db.update(schema.seatDisputes).set({ openedAt: new Date(resetInstant.getTime() + 10_000) }).where(eq(schema.seatDisputes.id, dispute.id));

    await job.runReset(roomId, new Date(resetInstant.getTime() + 60_000));

    const [row] = await db.select().from(schema.seatDisputes).where(eq(schema.seatDisputes.id, dispute.id));
    expect(row?.status).toBe("OPEN");
  });

  it("does not force UNKNOWN on a seat with a check-in from the new day", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });
    const room = await getRoom(db);
    const resetInstant = resetInstantFor(room, new Date());
    await db.update(schema.checkIns).set({ startedAt: new Date(resetInstant.getTime() + 10_000) }).where(eq(schema.checkIns.id, checkIn.id));
    const [before] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatId));

    await job.runReset(roomId, new Date(resetInstant.getTime() + 60_000));

    const [after] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatId));
    expect(after?.status).toBe(before?.status);
    expect(after?.status).not.toBe("UNKNOWN");
  });

  it("tick keeps resetting other rooms when one room fails", async () => {
    const spy = vi.spyOn(job, "runReset").mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(job.tick()).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    spy.mockRestore();
    err.mockRestore();
  });

  it("a second run the same day is a no-op", async () => {
    const room = await getRoom(db);
    const after = new Date(resetInstantFor(room, new Date()).getTime() + 60_000);
    expect(await job.runReset(roomId, after)).toBe(true);
    expect(await job.runReset(roomId, new Date(after.getTime() + 5 * 60_000))).toBe(false);
  });

  it("two concurrent runs (simulating separate instances) only apply the reset once", async () => {
    await checkIns.checkIn({ userId: "u1", roomId, seatId, location, showIdentity: false });

    const room = await getRoom(db);
    const after = new Date(resetInstantFor(room, new Date()).getTime() + 60_000);
    // Backdate the check-in to before the reset instant, otherwise it counts as a new-day check-in and is kept.
    await db.update(schema.checkIns).set({ startedAt: new Date(after.getTime() - 60 * 60_000) }).where(eq(schema.checkIns.userId, "u1"));
    const results = await Promise.all([job.runReset(roomId, after), job.runReset(roomId, after)]);
    expect(results.filter(Boolean)).toHaveLength(1);

    const events = await db.select().from(schema.seatStateEvents).where(eq(schema.seatStateEvents.eventType, "DAILY_RESET"));
    expect(events).toHaveLength(108); // one batch, not two
  });
});

describe("resetInstantFor (America/Argentina/Buenos_Aires, 04:00)", () => {
  const room = { timezone: "America/Argentina/Buenos_Aires", dailyResetTime: "04:00" };

  it("fires at 07:00 UTC", () => {
    expect(resetInstantFor(room, new Date("2026-03-10T12:00:00Z")).toISOString()).toBe("2026-03-10T07:00:00.000Z");
  });

  it("around midnight UTC the local day is still the previous one", () => {
    // 00:30 UTC on the 11th is 21:30 ART on the 10th: today's reset is still the 10th's 07:00 UTC.
    expect(resetInstantFor(room, new Date("2026-03-11T00:30:00Z")).toISOString()).toBe("2026-03-10T07:00:00.000Z");
    // 02:59 UTC on the 11th is 23:59 ART on the 10th; 03:00 UTC is local midnight, now the 11th.
    expect(resetInstantFor(room, new Date("2026-03-11T02:59:00Z")).toISOString()).toBe("2026-03-10T07:00:00.000Z");
    expect(resetInstantFor(room, new Date("2026-03-11T03:00:00Z")).toISOString()).toBe("2026-03-11T07:00:00.000Z");
  });

  it("one minute before 04:00 ART is before that day's reset, one minute after is past it", () => {
    const now = new Date("2026-03-11T06:59:00Z");
    expect(now.getTime()).toBeLessThan(resetInstantFor(room, now).getTime());
    const later = new Date("2026-03-11T07:01:00Z");
    expect(later.getTime()).toBeGreaterThan(resetInstantFor(room, later).getTime());
  });
});
