import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { freshDb, getRoom, insertUsers } from "../test-utils.js";
import { StudySessionService, minutesByLocalDay, verifiedMinutesFor, type CheckInForSession } from "./study-session.service.js";

describe("StudySessionService", () => {
  let db: Db;
  let svc: StudySessionService;
  let roomId: string;

  beforeEach(async () => {
    db = await freshDb();
    svc = new StudySessionService(db);
    const room = await getRoom(db);
    roomId = room.id;
    await insertUsers(db, ["u1"]);
  });

  function checkIn(overrides: Partial<CheckInForSession> = {}): CheckInForSession {
    return {
      id: "11111111-1111-1111-1111-111111111111",
      userId: "u1",
      roomId,
      startedAt: new Date("2026-01-05T10:00:00Z"),
      expiresAt: new Date("2026-01-05T11:00:00Z"),
      ...overrides,
    };
  }

  it("records verified minutes clamped to the check-in's own expiry", async () => {
    const ci = checkIn();
    await db.transaction((tx) => svc.recordFromCheckIn(tx, ci, new Date("2026-01-05T10:45:00Z")));

    const [row] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, ci.id));
    expect(row?.verifiedMinutes).toBe(45);
  });

  it("caps verified minutes at 720 even for a much longer session", async () => {
    const ci = checkIn({ id: "22222222-2222-2222-2222-222222222222", expiresAt: new Date("2026-01-07T10:00:00Z") });
    await db.transaction((tx) => svc.recordFromCheckIn(tx, ci, new Date("2026-01-07T10:00:00Z")));

    const [row] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, ci.id));
    expect(row?.verifiedMinutes).toBe(720);
  });

  it("keeps a renewed 5h stay uncapped by the old 240 limit", async () => {
    const ci = checkIn({ id: "55555555-5555-5555-5555-555555555555", expiresAt: new Date("2026-01-05T16:00:00Z") });
    await db.transaction((tx) => svc.recordFromCheckIn(tx, ci, new Date("2026-01-05T15:00:00Z")));

    const [row] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, ci.id));
    expect(row?.verifiedMinutes).toBe(300);
  });

  it("skips sessions shorter than 5 minutes", async () => {
    const ci = checkIn({ id: "33333333-3333-3333-3333-333333333333" });
    await db.transaction((tx) => svc.recordFromCheckIn(tx, ci, new Date("2026-01-05T10:04:00Z")));

    const rows = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, ci.id));
    expect(rows).toHaveLength(0);
  });

  it("is idempotent: recording the same check-in twice only inserts one row", async () => {
    const ci = checkIn({ id: "44444444-4444-4444-4444-444444444444" });
    await db.transaction((tx) => svc.recordFromCheckIn(tx, ci, new Date("2026-01-05T10:30:00Z")));
    await db.transaction((tx) => svc.recordFromCheckIn(tx, ci, new Date("2026-01-05T10:30:00Z")));

    const rows = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, ci.id));
    expect(rows).toHaveLength(1);
  });

  it("stores the start's local date (room timezone), even when the stay ends the next day", async () => {
    // 2026-01-06T01:00Z is still 2026-01-05 22:00 in Buenos Aires.
    const ci = checkIn({ id: "66666666-6666-6666-6666-666666666666", startedAt: new Date("2026-01-06T01:00:00Z"), expiresAt: new Date("2026-01-06T07:00:00Z") });
    await db.transaction((tx) => svc.recordFromCheckIn(tx, ci, new Date("2026-01-06T07:00:00Z")));

    const [row] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, ci.id));
    expect(row).toMatchObject({ verifiedMinutes: 360, localDate: "2026-01-05" });
  });

  it("records a MANUAL session with no check-in", async () => {
    const id = await db.transaction((tx) => svc.recordManual(tx, { userId: "u1", roomId, startedAt: new Date("2026-01-05T12:00:00Z"), minutes: 90 }));

    const [row] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, id));
    expect(row).toMatchObject({ source: "MANUAL", checkInId: null, verifiedMinutes: 90, localDate: "2026-01-05" });
    expect(row?.endedAt.toISOString()).toBe("2026-01-05T13:30:00.000Z");
  });
});

describe("minutesByLocalDay", () => {
  const BA = "America/Argentina/Buenos_Aires";

  it("keeps a same-day stay whole", () => {
    expect(minutesByLocalDay(new Date("2026-01-05T12:00:00Z"), 300, BA)).toEqual([{ day: "2026-01-05", minutes: 300 }]);
  });

  it("splits a 22:00-04:00 local stay at local midnight", () => {
    expect(minutesByLocalDay(new Date("2026-01-06T01:00:00Z"), 360, BA)).toEqual([
      { day: "2026-01-05", minutes: 120 },
      { day: "2026-01-06", minutes: 240 },
    ]);
  });

  it("splits at the room's own midnight, not UTC's", () => {
    // 22:00Z-04:00Z: in UTC that's 120 + 240, but in Buenos Aires it's all 19:00-01:00 local -> 300 + 60.
    expect(minutesByLocalDay(new Date("2026-01-05T22:00:00Z"), 360, "UTC")).toEqual([
      { day: "2026-01-05", minutes: 120 },
      { day: "2026-01-06", minutes: 240 },
    ]);
    expect(minutesByLocalDay(new Date("2026-01-05T22:00:00Z"), 360, BA)).toEqual([
      { day: "2026-01-05", minutes: 300 },
      { day: "2026-01-06", minutes: 60 },
    ]);
  });

  it("always sums to the input, even for an off-minute start right before midnight", () => {
    const parts = minutesByLocalDay(new Date("2026-01-06T02:59:30Z"), 2, BA); // 23:59:30 local
    expect(parts).toEqual([
      { day: "2026-01-05", minutes: 1 },
      { day: "2026-01-06", minutes: 1 },
    ]);
  });

  it("returns nothing for zero minutes", () => {
    expect(minutesByLocalDay(new Date("2026-01-05T12:00:00Z"), 0, BA)).toEqual([]);
  });
});

describe("verifiedMinutesFor", () => {
  const start = new Date("2026-01-05T10:00:00Z");
  const expires = new Date("2026-01-05T13:00:00Z");

  it("clamps the end to expiry", () => {
    expect(verifiedMinutesFor(start, expires, new Date("2026-01-05T20:00:00Z"))).toBe(180);
  });

  it("returns 0 below the 5-minute minimum and counts from 5", () => {
    expect(verifiedMinutesFor(start, expires, new Date("2026-01-05T10:04:59Z"))).toBe(0);
    expect(verifiedMinutesFor(start, expires, new Date("2026-01-05T10:05:00Z"))).toBe(5);
  });

  it("caps at 720", () => {
    expect(verifiedMinutesFor(start, new Date("2026-01-07T10:00:00Z"), new Date("2026-01-07T10:00:00Z"))).toBe(720);
  });
});
