import { describe, expect, it } from "vitest";
import { badgeProgressText, daysLabel, freezeBlockedReason, freezeDateLabel, streakSummary } from "./badges-view";

describe("badgeProgressText", () => {
  it("celebrates earned badges", () => {
    expect(badgeProgressText({ earned: true, progress: 1 })).toBe("¡Conseguida!");
  });

  it("shows a floored percentage and never 100 % while unearned", () => {
    expect(badgeProgressText({ earned: false, progress: 0.375 })).toBe("37 % completado");
    expect(badgeProgressText({ earned: false, progress: 0.999 })).toBe("99 % completado");
  });

  it("says so when there is no progress", () => {
    expect(badgeProgressText({ earned: false, progress: 0 })).toBe("Todavía no");
  });
});

describe("labels", () => {
  it("pluralizes days", () => {
    expect(daysLabel(1)).toBe("1 día");
    expect(daysLabel(0)).toBe("0 días");
    expect(daysLabel(12)).toBe("12 días");
  });

  it("labels freeze dates with the weekday", () => {
    expect(freezeDateLabel("2026-01-14")).toBe("mié 14/1"); // Wednesday
    expect(freezeDateLabel("2026-01-11")).toBe("dom 11/1");
  });

  it("summarizes the streak", () => {
    expect(streakSummary({ current: 1, longest: 5 })).toBe("Racha actual: 1 día · Mejor: 5 días");
  });
});

describe("freezeBlockedReason", () => {
  it("explains the monthly limit first, then an empty window", () => {
    expect(freezeBlockedReason({ freezeAvailableThisMonth: false, freezableDates: ["2026-01-14"] })).toMatch(/este mes/);
    expect(freezeBlockedReason({ freezeAvailableThisMonth: true, freezableDates: [] })).toMatch(/última semana/);
    expect(freezeBlockedReason({ freezeAvailableThisMonth: true, freezableDates: ["2026-01-14"] })).toBeNull();
  });
});
