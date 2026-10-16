import { describe, expect, it } from "vitest";
import { addDays, artWeekBounds, computeStreaks, qualifyingDays, STREAK_MIN_MINUTES, weekdayOf } from "./streak.js";

const set = (...days: string[]) => new Set(days);

describe("qualifyingDays", () => {
  it("keeps days at or above the threshold", () => {
    const byDay = new Map([
      ["2026-10-14", STREAK_MIN_MINUTES],
      ["2026-10-15", STREAK_MIN_MINUTES - 1],
      ["2026-10-16", 120],
    ]);
    expect([...qualifyingDays(byDay)]).toEqual(["2026-10-14", "2026-10-16"]);
    expect([...qualifyingDays(byDay, 100)]).toEqual(["2026-10-16"]);
  });
});

describe("computeStreaks", () => {
  const today = "2026-10-16";

  it("is zero for an empty set", () => {
    expect(computeStreaks(set(), set(), today)).toEqual({ current: 0, longest: 0 });
  });

  it("counts a run ending today", () => {
    expect(computeStreaks(set("2026-10-14", "2026-10-15", "2026-10-16"), set(), today)).toEqual({ current: 3, longest: 3 });
  });

  it("keeps a run that ended yesterday alive", () => {
    expect(computeStreaks(set("2026-10-14", "2026-10-15"), set(), today)).toEqual({ current: 2, longest: 2 });
  });

  it("resets current when the last studied day is older than yesterday", () => {
    expect(computeStreaks(set("2026-10-13", "2026-10-14"), set(), today)).toEqual({ current: 0, longest: 2 });
  });

  it("breaks the run on a gap", () => {
    expect(computeStreaks(set("2026-10-12", "2026-10-14", "2026-10-15", "2026-10-16"), set(), today)).toEqual({ current: 3, longest: 3 });
  });

  it("lets a frozen day bridge a gap", () => {
    expect(computeStreaks(set("2026-10-14", "2026-10-16"), set("2026-10-15"), today)).toEqual({ current: 3, longest: 3 });
  });

  it("counts a frozen day on its own", () => {
    expect(computeStreaks(set(), set("2026-10-15"), today)).toEqual({ current: 1, longest: 1 });
  });

  it("reports a longest run longer than the current one", () => {
    const old = set("2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04");
    expect(computeStreaks(new Set([...old, "2026-10-16"]), set(), today)).toEqual({ current: 1, longest: 4 });
  });

  it("runs across month and year boundaries", () => {
    expect(computeStreaks(set("2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"), set(), "2026-01-02")).toEqual({ current: 4, longest: 4 });
    expect(computeStreaks(set("2026-02-28", "2026-03-01"), set(), "2026-03-01")).toEqual({ current: 2, longest: 2 });
  });
});

describe("date helpers", () => {
  it("adds days across boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 2)).toBe("2024-03-01");
  });

  it("numbers weekdays from Monday", () => {
    expect(weekdayOf("2026-10-12")).toBe(0); // Monday
    expect(weekdayOf("2026-10-16")).toBe(4); // Friday
    expect(weekdayOf("2026-10-18")).toBe(6); // Sunday
  });

  it("finds the Monday..Sunday week", () => {
    expect(artWeekBounds("2026-10-18")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(artWeekBounds("2026-10-12")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(artWeekBounds("2026-11-01")).toEqual({ start: "2026-10-26", end: "2026-11-01" });
  });
});
