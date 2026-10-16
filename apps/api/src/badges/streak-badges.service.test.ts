import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { freshDb, getRoom, insertUsers } from "../test-utils.js";
import { FixedClock } from "../platform/clock.js";
import { ApiException } from "../common/api-error.js";
import { StreakBadgesService } from "./streak-badges.service.js";

// Buenos Aires is UTC-3, no DST: 15:00Z is mid-afternoon local, clear of midnight.
const NOW = new Date("2026-01-15T15:00:00Z"); // local 2026-01-15 (Thursday)

describe("StreakBadgesService", () => {
  let db: Db;
  let svc: StreakBadgesService;
  let roomId: string;
  let n = 0;

  beforeEach(async () => {
    db = freshDb();
    svc = new StreakBadgesService(db, new FixedClock(NOW));
    roomId = (await getRoom(db)).id;
    await insertUsers(db, ["u1", "u2"]);
  });

  async function session(userId: string, localDate: string, minutes: number, startUtc = `${localDate}T12:00:00Z`) {
    n++;
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const startedAt = new Date(startUtc);
    await db.insert(schema.studySessions).values({
      id,
      userId,
      roomId,
      checkInId: id,
      startedAt,
      endedAt: new Date(startedAt.getTime() + minutes * 60_000),
      verifiedMinutes: minutes,
      localDate,
      source: "CHECK_IN",
    });
  }

  async function failure(p: Promise<unknown>): Promise<ApiException> {
    const err = await p.then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ApiException);
    return err as ApiException;
  }

  describe("streak", () => {
    it("is empty without sessions, with the whole window freezable", async () => {
      const streak = await svc.streak("u1");
      expect(streak).toMatchObject({ current: 0, longest: 0, frozenDates: [], freezeAvailableThisMonth: true });
      expect(streak.freezableDates).toEqual(["2026-01-08", "2026-01-09", "2026-01-10", "2026-01-11", "2026-01-12", "2026-01-13", "2026-01-14"]);
    });

    it("counts consecutive qualifying days ending today", async () => {
      await session("u1", "2026-01-13", 40);
      await session("u1", "2026-01-14", 40);
      await session("u1", "2026-01-15", 40);
      expect(await svc.streak("u1")).toMatchObject({ current: 3, longest: 3 });
    });

    it("a freeze bridges a gap and is no longer freezable", async () => {
      await session("u1", "2026-01-12", 40);
      await session("u1", "2026-01-14", 40);
      await session("u1", "2026-01-15", 40);
      expect((await svc.streak("u1")).current).toBe(2);
      const after = await svc.freeze("u1", "2026-01-13");
      expect(after).toMatchObject({ current: 4, longest: 4, frozenDates: ["2026-01-13"], freezeAvailableThisMonth: false });
      expect(after.freezableDates).toEqual([]);
    });
  });

  describe("freeze", () => {
    it("rejects today, the future and days older than 7 days back", async () => {
      for (const date of ["2026-01-15", "2026-01-16", "2026-01-07"]) {
        const err = await failure(svc.freeze("u1", date));
        expect(err.code).toBe("VALIDATION_ERROR");
        expect(err.message).toMatch(/últimos 7/);
      }
      await expect(svc.freeze("u1", "2026-01-08")).resolves.toBeTruthy(); // the oldest allowed day
    });

    it("rejects a day that already qualifies", async () => {
      await session("u1", "2026-01-14", 30);
      const err = await failure(svc.freeze("u1", "2026-01-14"));
      expect(err.message).toMatch(/ya cuenta/);
    });

    it("allows a day just under the threshold", async () => {
      await session("u1", "2026-01-14", 29);
      expect((await svc.freeze("u1", "2026-01-14")).frozenDates).toEqual(["2026-01-14"]);
    });

    it("rejects a second freeze in the same month", async () => {
      await svc.freeze("u1", "2026-01-13");
      const err = await failure(svc.freeze("u1", "2026-01-12"));
      expect(err.message).toMatch(/este mes/);
    });

    it("allows a freeze in a different month", async () => {
      const feb = new StreakBadgesService(db, new FixedClock(new Date("2026-02-03T15:00:00Z"))); // local 2026-02-03
      await feb.freeze("u1", "2026-01-30");
      const second = await feb.freeze("u1", "2026-02-01");
      expect(second.frozenDates).toEqual(["2026-01-30", "2026-02-01"]);
    });

    it("is idempotent for the same date and writes one row", async () => {
      await svc.freeze("u1", "2026-01-13");
      const again = await svc.freeze("u1", "2026-01-13");
      expect(again.frozenDates).toEqual(["2026-01-13"]);
      expect(db.select().from(schema.streakFreezes).all()).toHaveLength(1);
    });

    it("is per user", async () => {
      await svc.freeze("u1", "2026-01-13");
      expect((await svc.freeze("u2", "2026-01-13")).frozenDates).toEqual(["2026-01-13"]);
    });

    it("answers featureDisabled when the table is missing, while reads keep working", async () => {
      db.run(sql`DROP TABLE streak_freezes`);
      const err = await failure(svc.freeze("u1", "2026-01-13"));
      expect(err.code).toBe("FEATURE_DISABLED");
      expect((await svc.streak("u1")).frozenDates).toEqual([]);
    });
  });

  describe("badges", () => {
    it("earns nothing for a user with no study", async () => {
      const { badges } = await svc.badges("u1");
      expect(badges).toHaveLength(8);
      expect(badges.filter((b) => b.earned)).toEqual([]);
    });

    it("derives first session, hours, early bird and night owl from sessions", async () => {
      const earnedIds = async () => (await svc.badges("u1")).badges.filter((b) => b.earned).map((b) => b.id);
      await session("u1", "2026-01-14", 600, "2026-01-14T10:00:00Z"); // 07:00 -> 17:00 local
      expect(await earnedIds()).toEqual(["first_session", "hours_10", "early_bird"]);
      await session("u1", "2026-01-13", 60, "2026-01-14T00:30:00Z"); // 21:30 -> 22:30 local
      expect(await earnedIds()).toEqual(["first_session", "hours_10", "early_bird", "night_owl"]);
    });

    it("counts the longest streak, frozen days included", async () => {
      for (const d of ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-10", "2026-01-11", "2026-01-12"]) await session("u1", d, 40);
      expect((await svc.badges("u1")).badges.find((b) => b.id === "streak_7")!.earned).toBe(false);
      await db.insert(schema.streakFreezes).values({ userId: "u1", localDate: "2026-01-09" });
      expect((await svc.badges("u1")).badges.find((b) => b.id === "streak_7")!.earned).toBe(true);
    });
  });
});
