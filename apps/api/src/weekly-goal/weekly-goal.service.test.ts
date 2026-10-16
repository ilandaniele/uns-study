import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { FixedClock } from "../platform/clock.js";
import { freshDb, getRoom, insertUsers } from "../test-utils.js";
import { WeeklyGoalService } from "./weekly-goal.service.js";

// ART is UTC-3 with no DST. Week of Mon 2026-10-12 .. Sun 2026-10-18.
const SUNDAY_NIGHT = new Date("2026-10-19T02:50:00Z"); // Sun 23:50 ART
const WEDNESDAY = new Date("2026-10-14T15:00:00Z");

describe("WeeklyGoalService", () => {
  let db: Db;
  let clock: FixedClock;
  let service: WeeklyGoalService;
  let roomId: string;

  beforeEach(async () => {
    db = freshDb();
    clock = new FixedClock(WEDNESDAY);
    service = new WeeklyGoalService(db, clock);
    roomId = (await getRoom(db)).id;
    await insertUsers(db, ["u1", "u2"]);
  });

  async function session(userId: string, startedAt: string, minutes: number, localDate: string) {
    const start = new Date(startedAt);
    await db.insert(schema.studySessions).values({
      userId,
      roomId,
      startedAt: start,
      endedAt: new Date(start.getTime() + minutes * 60_000),
      verifiedMinutes: minutes,
      localDate,
      source: "CHECK_IN",
    });
  }

  it("returns defaults without a goal", async () => {
    expect(await service.get("u1")).toEqual({
      goalMinutes: null,
      reminderEnabled: true,
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      studiedMinutes: 0,
    });
  });

  it("starts the week on Monday 00:00 ART: Sunday 23:30 counts, Monday 00:10 does not count in the previous week", async () => {
    clock.set(SUNDAY_NIGHT);
    await session("u1", "2026-10-19T02:30:00Z", 15, "2026-10-18"); // Sun 23:30 ART, this week
    await session("u1", "2026-10-12T03:10:00Z", 30, "2026-10-12"); // Mon 00:10 ART, same week
    await session("u1", "2026-10-12T02:00:00Z", 60, "2026-10-11"); // Sun 23:00 ART the week before
    expect((await service.get("u1")).studiedMinutes).toBe(45);

    clock.set(new Date("2026-10-12T02:50:00Z")); // Sun 23:50 ART, previous week (10-05..10-11)
    const prev = await service.get("u1");
    expect(prev).toMatchObject({ weekStart: "2026-10-05", weekEnd: "2026-10-11" });
    expect(prev.studiedMinutes).toBe(60);
  });

  it("only counts the part of a session spilling over Monday midnight that falls in the week", async () => {
    await session("u1", "2026-10-12T02:30:00Z", 60, "2026-10-11"); // Sun 23:30 ART -> Mon 00:30 ART
    expect((await service.get("u1")).studiedMinutes).toBe(30);
  });

  it("put stores the goal, keeps the reminder default and reflects progress", async () => {
    await session("u1", "2026-10-14T13:00:00Z", 90, "2026-10-14");
    const dto = await service.put("u1", { minutes: 300 });
    expect(dto).toMatchObject({ goalMinutes: 300, reminderEnabled: true, studiedMinutes: 90 });
    expect(await service.get("u2")).toMatchObject({ goalMinutes: null });
  });

  it("put keeps the existing reminder flag unless one is given", async () => {
    await service.put("u1", { minutes: 300, reminderEnabled: false });
    expect(await service.put("u1", { minutes: 360 })).toMatchObject({ goalMinutes: 360, reminderEnabled: false });
    expect(await service.put("u1", { minutes: 360, reminderEnabled: true })).toMatchObject({ reminderEnabled: true });
  });

  it("put null deletes the row", async () => {
    await service.put("u1", { minutes: 300 });
    expect(await service.put("u1", { minutes: null })).toMatchObject({ goalMinutes: null, reminderEnabled: true });
    expect(await db.select().from(schema.studyGoals)).toHaveLength(0);
    await service.put("u1", { minutes: null }); // no row: no-op, no throw
  });

  it("skips the write when nothing changed", async () => {
    await service.put("u1", { minutes: 300 });
    const [before] = await db.select().from(schema.studyGoals);
    clock.advance(60_000);
    await service.put("u1", { minutes: 300 });
    await service.put("u1", { minutes: 300, reminderEnabled: true });
    const [after] = await db.select().from(schema.studyGoals);
    expect(after!.updatedAt).toEqual(before!.updatedAt);
    await service.put("u1", { minutes: 301 });
    const [changed] = await db.select().from(schema.studyGoals);
    expect(changed!.updatedAt).not.toEqual(before!.updatedAt);
  });

  describe("reminderCandidates", () => {
    it("lists users with a goal and the reminder on, with their weekly progress", async () => {
      await session("u1", "2026-10-14T13:00:00Z", 120, "2026-10-14");
      await service.put("u1", { minutes: 300 });
      await service.put("u2", { minutes: 600, reminderEnabled: false });
      expect(await service.reminderCandidates(WEDNESDAY)).toEqual([{ userId: "u1", goalMinutes: 300, studiedMinutes: 120 }]);
    });
  });

  describe("without the study_goals table", () => {
    beforeEach(() => {
      db.run(sql`DROP TABLE study_goals`);
    });

    it("get returns defaults, candidates are empty and put is FEATURE_DISABLED", async () => {
      expect(await service.get("u1")).toMatchObject({ goalMinutes: null, reminderEnabled: true });
      expect(await service.reminderCandidates(WEDNESDAY)).toEqual([]);
      await expect(service.put("u1", { minutes: 300 })).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    });
  });
});
