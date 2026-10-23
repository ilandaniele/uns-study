import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import { operatingWindow } from "./room-hours.js";
import { buildServices } from "../container.js";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { FixedClock } from "../platform/clock.js";
import { ManualScheduler } from "../platform/scheduler.js";
import { RecordingHub } from "../realtime/realtime-hub.js";

const TZ = "America/Argentina/Buenos_Aires";
afterEach(() => vi.useRealTimers());

describe("owner-confirmed room hours", () => {
  it.each([
    ["2026-10-23T07:59:59-03:00", false, "2026-10-24T03:00:00.000Z"],
    ["2026-10-23T08:00:00-03:00", true, "2026-10-24T03:00:00.000Z"],
    ["2026-10-23T23:59:59-03:00", true, "2026-10-24T03:00:00.000Z"],
    ["2026-10-24T00:00:00-03:00", false, "2026-10-25T01:00:00.000Z"],
    ["2026-10-24T21:59:59-03:00", true, "2026-10-25T01:00:00.000Z"],
    ["2026-10-24T22:00:00-03:00", false, "2026-10-25T01:00:00.000Z"],
    ["2026-10-25T22:00:00-03:00", false, "2026-10-26T01:00:00.000Z"],
    ["2026-12-08T22:00:00-03:00", false, "2026-12-09T01:00:00.000Z"],
    ["2026-11-11T22:00:00-03:00", false, "2026-11-12T01:00:00.000Z"],
  ])("%s is open=%s and closes at %s", (date, open, close) => {
    const window = operatingWindow(new Date(date), TZ);
    expect(window.open).toBe(open);
    expect(window.closesAt.toISOString()).toBe(close);
  });

  async function setup(instant: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    const db = freshDb();
    const clock = new FixedClock(new Date());
    const services = buildServices({ db, clock, hub: new RecordingHub(), scheduler: new ManualScheduler(clock), evidence: null });
    const room = await getRoom(db);
    const seat = (await getSeats(db))[0]!;
    await insertUsers(db, ["u1", "viewer"]);
    return { db, services, room, seat, location: { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() } };
  }

  it("production wiring hides stale presences and study statuses at 01:22, without ending login sessions", async () => {
    const { db, services, room, seat, location } = await setup("2026-10-23T01:22:00-03:00");
    await db.insert(schema.checkIns).values({ userId: "u1", roomId: room.id, seatId: seat.id, status: "ACTIVE", startedAt: new Date("2026-10-22T20:00:00-03:00"), expiresAt: new Date("2026-10-23T06:00:00-03:00") });
    await db.insert(schema.studyStatus).values({ userId: "u1", roomId: room.id, active: true });
    expect((await services.roomState.getRoomSummary(room.id)).occupied).toBe(0);
    expect(await services.roomPeople.listPeople(room.id, "viewer")).toEqual([]);
    expect(await services.roomPeople.listOccupants(room.id)).toEqual([]);
    expect(await services.checkIns.getActiveCheckIn("u1")).toBeNull();
    expect((await services.rooms.getRoomMap(room.id)).room.operatingHours?.open).toBe(false);
    await expect(services.checkIns.assertPresence("u1", room.id, location)).rejects.toThrow("cerrada");
    await expect(services.study.start("u1", room.id, { lookingForGroup: false })).rejects.toThrow("cerrada");
    await expect(services.observations.assertPresence("u1", room.id, location)).rejects.toThrow("cerrada");
    // A legacy Pro stay with an overlong expiry must not reappear at reopening,
    // even if the cron sweep did not run overnight.
    await db.update(schema.checkIns).set({ expiresAt: new Date("2026-10-23T10:00:00-03:00") }).where(eq(schema.checkIns.userId, "u1"));
    vi.setSystemTime(new Date("2026-10-23T08:00:00-03:00"));
    expect((await services.roomState.getRoomSummary(room.id)).occupied).toBe(0);
    expect(await services.roomPeople.listPeople(room.id, "viewer")).toEqual([]);
    expect(await services.roomPeople.listOccupants(room.id)).toEqual([]);
    expect(await services.checkIns.getActiveCheckIn("u1")).toBeNull();
    vi.setSystemTime(new Date("2026-10-23T01:22:00-03:00"));
    await services.jobs.expiration.runSweep();
    const [row] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.userId, "u1"));
    expect(row?.status).toBe("EXPIRED");
    expect(row?.expiresAt.toISOString()).toBe("2026-10-23T03:00:00.000Z");
    const [study] = await db.select().from(schema.studyStatus).where(eq(schema.studyStatus.userId, "u1"));
    expect(study?.active).toBe(false);
  });

  it.each([
    ["2026-10-23T23:30:00-03:00", "2026-10-24T03:00:00.000Z"],
    ["2026-10-24T21:30:00-03:00", "2026-10-25T01:00:00.000Z"],
    ["2026-12-08T21:30:00-03:00", "2026-12-09T01:00:00.000Z"],
  ])("caps create and renewal at closing: %s", async (instant, close) => {
    const { services, room, seat, location } = await setup(instant);
    const result = await services.checkIns.checkIn({ userId: "u1", roomId: room.id, seatId: seat.id, location, showIdentity: false, durationMinutes: 720 });
    expect(result.checkIn.expiresAt).toBe(close);
    const extended = await services.checkIns.extend("u1", location, result.checkIn, 720);
    expect(extended.expiresAt).toBe(close);
    expect((await services.roomState.getRoomSummary(room.id)).occupied).toBe(1);
  });
});
