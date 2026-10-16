import { describe, expect, it } from "vitest";
import { aggregateHistory } from "./history-aggregate.js";
import { minutesByDay, type StudyInterval } from "./study-intervals.js";

const TZ = "America/Argentina/Buenos_Aires"; // UTC-3, no DST
const TODAY = "2026-01-15"; // a Thursday

function iv(isoUtc: string, minutes: number): StudyInterval {
  return { startedAt: new Date(isoUtc), minutes, roomId: "r", live: false };
}

function run(intervals: StudyInterval[], opts: { frozen?: string[]; days?: 30 | 90 } = {}) {
  return aggregateHistory(intervals, new Set(opts.frozen ?? []), minutesByDay(intervals, TZ), TODAY, opts.days ?? 30, TZ);
}

describe("aggregateHistory", () => {
  it("zero-fills every day oldest first", () => {
    const h = run([]);
    expect(h.byDay).toHaveLength(30);
    expect(h.byDay[0]).toEqual({ date: "2025-12-17", minutes: 0 });
    expect(h.byDay[29]).toEqual({ date: TODAY, minutes: 0 });
    expect(h.from).toBe("2025-12-17");
    expect(h.to).toBe(TODAY);
    expect(h.byWeekday).toHaveLength(7);
    expect(h.byHour).toHaveLength(24);
  });

  it("returns nulls and zeros when empty", () => {
    const h = run([]);
    expect(h).toMatchObject({ totalMinutes: 0, sessionCount: 0, activeDays: 0, bestHour: null, streak: { current: 0, longest: 0, frozenDates: [] } });
  });

  it("splits a session across local midnight", () => {
    // 23:30 local on the 13th (02:30Z on the 14th) for 60 minutes.
    const h = run([iv("2026-01-14T02:30:00Z", 60)]);
    const by = Object.fromEntries(h.byDay.map((d) => [d.date, d.minutes]));
    expect(by["2026-01-13"]).toBe(30);
    expect(by["2026-01-14"]).toBe(30);
    expect(h.totalMinutes).toBe(60);
    expect(h.activeDays).toBe(2);
    expect(h.sessionCount).toBe(1);
  });

  it("splits a session across two local hours", () => {
    // 14:45 local for 30 minutes: 15 in hour 14, 15 in hour 15.
    const h = run([iv("2026-01-14T17:45:00Z", 30)]);
    expect(h.byHour[14]).toBe(15);
    expect(h.byHour[15]).toBe(15);
    expect(h.byHour.reduce((a, b) => a + b, 0)).toBe(30);
  });

  it("indexes weekdays from Monday = 0", () => {
    // 2026-01-12 is a Monday and 2026-01-11 a Sunday.
    const h = run([iv("2026-01-12T13:00:00Z", 40), iv("2026-01-11T13:00:00Z", 20)]);
    expect(h.byWeekday[0]).toBe(40);
    expect(h.byWeekday[6]).toBe(20);
  });

  it("picks the earliest hour on ties as bestHour", () => {
    const h = run([iv("2026-01-14T17:00:00Z", 30), iv("2026-01-13T13:00:00Z", 30)]);
    expect(h.byHour[10]).toBe(30);
    expect(h.byHour[14]).toBe(30);
    expect(h.bestHour).toBe(10);
  });

  it("counts a frozen day in the streak and lists it", () => {
    const h = run([iv("2026-01-15T13:00:00Z", 45), iv("2026-01-13T13:00:00Z", 45)], { frozen: ["2026-01-14"] });
    expect(h.streak.current).toBe(3);
    expect(h.streak.frozenDates).toEqual(["2026-01-14"]);
  });

  it("only counts days with 30+ minutes for the streak", () => {
    const h = run([iv("2026-01-15T13:00:00Z", 45), iv("2026-01-14T13:00:00Z", 10)]);
    expect(h.streak.current).toBe(1);
  });

  it("excludes older days from the window but keeps them for the streak", () => {
    const old = iv("2025-12-01T13:00:00Z", 60);
    const h30 = run([old]);
    expect(h30.totalMinutes).toBe(0);
    expect(h30.sessionCount).toBe(0);
    expect(h30.streak.longest).toBe(1);
    const h90 = run([old], { days: 90 });
    expect(h90.byDay).toHaveLength(90);
    expect(h90.totalMinutes).toBe(60);
  });
});
