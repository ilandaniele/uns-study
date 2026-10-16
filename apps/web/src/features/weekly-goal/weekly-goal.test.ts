import { describe, expect, it } from "vitest";
import { GOAL_HOUR_OPTIONS, formatHM, goalToHours, progressRatio } from "./weekly-goal";

describe("progressRatio", () => {
  it("is the studied fraction of the goal", () => {
    expect(progressRatio(150, 300)).toBe(0.5);
    expect(progressRatio(0, 300)).toBe(0);
  });

  it("clamps to 0..1 and is 0 without a goal", () => {
    expect(progressRatio(900, 300)).toBe(1);
    expect(progressRatio(-5, 300)).toBe(0);
    expect(progressRatio(100, null)).toBe(0);
    expect(progressRatio(100, 0)).toBe(0);
  });
});

describe("formatHM", () => {
  it("formats hours and minutes", () => {
    expect(formatHM(0)).toBe("0 min");
    expect(formatHM(45)).toBe("45 min");
    expect(formatHM(180)).toBe("3 h");
    expect(formatHM(150)).toBe("2 h 30 min");
  });

  it("rounds and never goes negative", () => {
    expect(formatHM(59.6)).toBe("1 h");
    expect(formatHM(-10)).toBe("0 min");
  });
});

describe("goal options", () => {
  it("run from 1 to 70 hours", () => {
    expect(GOAL_HOUR_OPTIONS[0]).toBe(1);
    expect(GOAL_HOUR_OPTIONS[GOAL_HOUR_OPTIONS.length - 1]).toBe(70);
    expect(GOAL_HOUR_OPTIONS).toHaveLength(70);
  });

  it("goalToHours rounds into the option range", () => {
    expect(goalToHours(300)).toBe(5);
    expect(goalToHours(100)).toBe(2);
    expect(goalToHours(4200)).toBe(70);
  });
});
