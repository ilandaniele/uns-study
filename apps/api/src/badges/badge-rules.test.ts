import { describe, expect, it } from "vitest";
import { evaluateBadges, hasEarlyStart, hasLateMinutes, type BadgeInput } from "./badge-rules.js";
import type { StudyInterval } from "../study-history/study-intervals.js";

const TZ = "America/Argentina/Buenos_Aires";
const EMPTY: BadgeInput = { totalMinutes: 0, sessionCount: 0, longestStreak: 0, hasEarly: false, hasLate: false };

function earned(input: Partial<BadgeInput>): string[] {
  return evaluateBadges({ ...EMPTY, ...input }).filter((b) => b.earned).map((b) => b.id);
}

const interval = (startedAt: string, minutes: number): StudyInterval => ({ startedAt: new Date(startedAt), minutes, roomId: "r", live: false });

describe("evaluateBadges", () => {
  it("earns nothing for a new user and reports zero progress", () => {
    expect(earned({})).toEqual([]);
    expect(evaluateBadges(EMPTY).every((b) => b.progress === 0)).toBe(true);
  });

  it("returns all eight badges in display order", () => {
    expect(evaluateBadges(EMPTY).map((b) => b.id)).toEqual(["first_session", "hours_10", "hours_50", "hours_100", "streak_7", "streak_30", "early_bird", "night_owl"]);
  });

  it("hour badges trigger exactly at 10, 50 and 100 hours", () => {
    expect(earned({ totalMinutes: 599 })).not.toContain("hours_10");
    expect(earned({ totalMinutes: 600 })).toContain("hours_10");
    expect(earned({ totalMinutes: 2999 })).not.toContain("hours_50");
    expect(earned({ totalMinutes: 3000 })).toEqual(expect.arrayContaining(["hours_10", "hours_50"]));
    expect(earned({ totalMinutes: 6000 })).toContain("hours_100");
  });

  it("streak badges use the longest streak", () => {
    expect(earned({ longestStreak: 6 })).not.toContain("streak_7");
    expect(earned({ longestStreak: 7 })).toContain("streak_7");
    expect(earned({ longestStreak: 29 })).not.toContain("streak_30");
    expect(earned({ longestStreak: 30 })).toEqual(expect.arrayContaining(["streak_7", "streak_30"]));
  });

  it("first session, early bird and night owl are flags", () => {
    expect(earned({ sessionCount: 1 })).toEqual(["first_session"]);
    expect(earned({ hasEarly: true })).toEqual(["early_bird"]);
    expect(earned({ hasLate: true })).toEqual(["night_owl"]);
  });

  it("progress is the fraction toward the target, capped at 1", () => {
    const hours10 = (input: Partial<BadgeInput>) => evaluateBadges({ ...EMPTY, ...input }).find((b) => b.id === "hours_10")!;
    expect(hours10({ totalMinutes: 300 }).progress).toBe(0.5);
    expect(hours10({ totalMinutes: 9000 }).progress).toBe(1);
  });
});

describe("hasEarlyStart", () => {
  it("is true only for a start before 08:00 local", () => {
    expect(hasEarlyStart([interval("2026-01-15T10:59:00Z", 60)], TZ)).toBe(true); // 07:59 local
    expect(hasEarlyStart([interval("2026-01-15T11:00:00Z", 60)], TZ)).toBe(false); // 08:00 local
    expect(hasEarlyStart([], TZ)).toBe(false);
  });
});

describe("hasLateMinutes", () => {
  it("is true when a stay runs past 21:00 local, false when it ends by then", () => {
    expect(hasLateMinutes([interval("2026-01-15T23:30:00Z", 60)], TZ)).toBe(true); // 20:30 -> 21:30 local
    expect(hasLateMinutes([interval("2026-01-15T23:00:00Z", 60)], TZ)).toBe(false); // 20:00 -> 21:00 local
    expect(hasLateMinutes([interval("2026-01-16T01:00:00Z", 30)], TZ)).toBe(true); // 22:00 local
    expect(hasLateMinutes([], TZ)).toBe(false);
  });
});
