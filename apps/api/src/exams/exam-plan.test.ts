import { describe, expect, it } from "vitest";
import { daysBetween, examPlan, isRealLocalDate } from "./exam-plan.js";

const base = { targetHours: 10, studiedMinutes: 0, today: "2026-10-16", examDate: "2026-10-26" };

describe("examPlan", () => {
  it("spreads the remaining minutes over the days left", () => {
    expect(examPlan(base)).toEqual({ daysLeft: 10, dailyPlanMinutes: 60 });
  });

  it("on exam day the whole remainder is due today", () => {
    expect(examPlan({ ...base, examDate: base.today, studiedMinutes: 100 })).toEqual({ daysLeft: 0, dailyPlanMinutes: 500 });
  });

  it("is null for a past exam, with a negative daysLeft", () => {
    expect(examPlan({ ...base, examDate: "2026-10-10" })).toEqual({ daysLeft: -6, dailyPlanMinutes: null });
  });

  it("is null once the target is met or exceeded", () => {
    expect(examPlan({ ...base, studiedMinutes: 600 }).dailyPlanMinutes).toBeNull();
    expect(examPlan({ ...base, studiedMinutes: 700 }).dailyPlanMinutes).toBeNull();
  });

  it("rounds up", () => {
    expect(examPlan({ ...base, studiedMinutes: 1 }).dailyPlanMinutes).toBe(60); // 599 / 10 = 59.9
    expect(examPlan({ ...base, targetHours: 1, examDate: "2026-10-19" }).dailyPlanMinutes).toBe(20);
    expect(examPlan({ ...base, targetHours: 1, examDate: "2026-10-18" }).dailyPlanMinutes).toBe(30);
  });
});

describe("date helpers", () => {
  it("counts days across a month boundary", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
  });

  it("accepts only real calendar dates", () => {
    expect(isRealLocalDate("2026-02-28")).toBe(true);
    expect(isRealLocalDate("2026-02-31")).toBe(false);
    expect(isRealLocalDate("26-02-01")).toBe(false);
  });
});
