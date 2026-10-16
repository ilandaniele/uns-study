import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { loadStudyIntervals, minutesBetween, minutesByDay, type StudyInterval } from "./study-intervals.js";

const TZ = "America/Argentina/Buenos_Aires"; // UTC-3, no DST
const NOW = new Date("2026-01-15T15:00:00Z"); // 12:00 local, 2026-01-15

describe("loadStudyIntervals", () => {
  let db: Db;
  let roomId: string;
  let seatId: string;

  beforeEach(async () => {
    db = freshDb();
    roomId = (await getRoom(db)).id;
    seatId = (await getSeats(db))[0]!.id;
    await insertUsers(db, ["u1", "u2"]);
  });

  async function session(userId: string, localDate: string, minutes: number, checkInId: string | null = null) {
    await db.insert(schema.studySessions).values({
      userId,
      roomId,
      checkInId,
      startedAt: new Date(`${localDate}T13:00:00Z`),
      endedAt: new Date(`${localDate}T14:00:00Z`),
      verifiedMinutes: minutes,
      localDate,
      source: "CHECK_IN",
    });
  }

  it("returns closed sessions since the date, only for that user", async () => {
    await session("u1", "2026-01-10", 60);
    await session("u1", "2026-01-14", 45);
    await session("u2", "2026-01-14", 99);
    const got = await loadStudyIntervals(db, "u1", "2026-01-12", NOW);
    expect(got.map((i) => i.minutes)).toEqual([45]);
    expect(got[0]).toMatchObject({ roomId, live: false });
  });

  it("includes the active check-in counted live up to now", async () => {
    await db.insert(schema.checkIns).values({
      userId: "u1",
      roomId,
      seatId,
      status: "ACTIVE",
      startedAt: new Date("2026-01-15T13:00:00Z"),
      expiresAt: new Date("2026-01-15T16:00:00Z"),
    });
    const got = await loadStudyIntervals(db, "u1", "2026-01-15", NOW);
    expect(got).toEqual([{ startedAt: new Date("2026-01-15T13:00:00Z"), minutes: 120, roomId, live: true }]);
  });

  it("does not count a check-in twice when it already has a session row", async () => {
    const [row] = await db
      .insert(schema.checkIns)
      .values({ userId: "u1", roomId, seatId, status: "ACTIVE", startedAt: new Date("2026-01-15T13:00:00Z"), expiresAt: new Date("2026-01-15T16:00:00Z") })
      .returning({ id: schema.checkIns.id });
    await session("u1", "2026-01-15", 120, row!.id);
    const got = await loadStudyIntervals(db, "u1", "2026-01-15", NOW);
    expect(got).toHaveLength(1);
    expect(got[0]!.live).toBe(false);
  });
});

describe("minutesByDay", () => {
  it("splits an interval across local midnight", () => {
    // 23:00 local (02:00Z next day) for 120 minutes: 60 on the 14th, 60 on the 15th.
    const intervals: StudyInterval[] = [{ startedAt: new Date("2026-01-15T02:00:00Z"), minutes: 120, roomId: "r", live: false }];
    expect([...minutesByDay(intervals, TZ)]).toEqual([
      ["2026-01-14", 60],
      ["2026-01-15", 60],
    ]);
  });

  it("sums intervals that land on the same day", () => {
    const intervals: StudyInterval[] = [
      { startedAt: new Date("2026-01-15T13:00:00Z"), minutes: 30, roomId: "r", live: false },
      { startedAt: new Date("2026-01-15T15:00:00Z"), minutes: 40, roomId: "r", live: true },
    ];
    expect(minutesByDay(intervals, TZ).get("2026-01-15")).toBe(70);
  });
});

describe("minutesBetween", () => {
  const intervals: StudyInterval[] = [{ startedAt: new Date("2026-01-15T13:00:00Z"), minutes: 120, roomId: "r", live: false }];

  it("counts only the overlap with the window", () => {
    expect(minutesBetween(intervals, new Date("2026-01-15T14:00:00Z"), new Date("2026-01-15T20:00:00Z"))).toBe(60);
    expect(minutesBetween(intervals, new Date("2026-01-15T12:00:00Z"), new Date("2026-01-15T13:30:00Z"))).toBe(30);
  });

  it("is zero outside the window and full when it covers the interval", () => {
    expect(minutesBetween(intervals, new Date("2026-01-15T15:00:00Z"), new Date("2026-01-15T16:00:00Z"))).toBe(0);
    expect(minutesBetween(intervals, new Date("2026-01-15T00:00:00Z"), new Date("2026-01-16T00:00:00Z"))).toBe(120);
  });
});
