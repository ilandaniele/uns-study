import { describe, expect, it } from "vitest";
import { emptyRankingMessage, formatRankingValue, PERIOD_LABELS } from "./labels";

describe("formatRankingValue", () => {
  it("formats study_time as compact hours + minutes (e.g. '6h 20m')", () => {
    expect(formatRankingValue("study_time", 380)).toBe("6h 20m");
    expect(formatRankingValue("study_time", 345)).toBe("5h 45m");
  });

  it("formats study_time with only hours when minutes are zero", () => {
    expect(formatRankingValue("study_time", 240)).toBe("4h");
  });

  it("formats study_time with only minutes under an hour", () => {
    expect(formatRankingValue("study_time", 45)).toBe("45m");
  });

  it("formats streak in days, singular vs plural", () => {
    expect(formatRankingValue("streak", 1)).toBe("1 día");
    expect(formatRankingValue("streak", 5)).toBe("5 días");
  });

  it("formats contribution in points, singular vs plural", () => {
    expect(formatRankingValue("contribution", 1)).toBe("1 punto");
    expect(formatRankingValue("contribution", 12)).toBe("12 puntos");
  });
});

describe("PERIOD_LABELS", () => {
  it("labels the all-time period as Histórico", () => {
    expect(PERIOD_LABELS.all).toBe("Histórico");
  });
});

describe("emptyRankingMessage", () => {
  it("has a distinct message for the all-time period", () => {
    expect(emptyRankingMessage("all")).toBe("Todavía no hay nadie en el ranking.");
  });

  it("mentions the period for time-bound periods", () => {
    expect(emptyRankingMessage("today")).toContain("hoy");
    expect(emptyRankingMessage("week")).toContain("esta semana");
    expect(emptyRankingMessage("month")).toContain("este mes");
  });
});
