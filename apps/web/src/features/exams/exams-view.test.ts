import { describe, expect, it } from "vitest";
import { countdownLabel, examProgress, formatDuration, formatExamDate, planLabel, progressLabel } from "./exams-view";

describe("formatDuration", () => {
  it("formats minutes, hours and both", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(180)).toBe("3 h");
    expect(formatDuration(150)).toBe("2 h 30 min");
    expect(formatDuration(0)).toBe("0 min");
  });
});

describe("countdownLabel", () => {
  it("covers future, tomorrow, today and past", () => {
    expect(countdownLabel(5)).toBe("Faltan 5 días");
    expect(countdownLabel(1)).toBe("Mañana");
    expect(countdownLabel(0)).toBe("Es hoy");
    expect(countdownLabel(-3)).toBe("Rendido");
  });
});

describe("planLabel", () => {
  it("is null without a plan", () => {
    expect(planLabel({ dailyPlanMinutes: null })).toBeNull();
    expect(planLabel({ dailyPlanMinutes: 90 })).toBe("Estudiá ~1 h 30 min por día");
  });
});

describe("progress", () => {
  it("clamps to 0..1 and labels against the target", () => {
    expect(examProgress({ studiedMinutes: 300, targetHours: 10 })).toBe(0.5);
    expect(examProgress({ studiedMinutes: 900, targetHours: 10 })).toBe(1);
    expect(progressLabel({ studiedMinutes: 150, targetHours: 10 })).toBe("2 h 30 min de 10 h");
  });
});

describe("formatExamDate", () => {
  it("is day first", () => {
    expect(formatExamDate("2026-10-26")).toBe("26/10/2026");
  });
});
