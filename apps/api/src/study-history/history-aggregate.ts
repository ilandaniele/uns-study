import type { StudyHistoryDto } from "@sala/contracts";
import { toZonedTime } from "date-fns-tz";
import { localDateOf } from "../common/dates.js";
import { addDays, computeStreaks, qualifyingDays, weekdayOf } from "./streak.js";
import { minutesByDay, type StudyInterval } from "./study-intervals.js";

const HOUR_MS = 3_600_000;

/** Minutes of each interval `[startedAt, startedAt + minutes)` per local hour of day (fractional, unrounded). */
function minutesByHour(intervals: readonly StudyInterval[], tz: string): number[] {
  const byHour = new Array<number>(24).fill(0);
  for (const interval of intervals) {
    let cursor = interval.startedAt.getTime();
    const end = cursor + interval.minutes * 60_000;
    while (cursor < end) {
      const zoned = toZonedTime(new Date(cursor), tz);
      const intoHour = (zoned.getMinutes() * 60 + zoned.getSeconds()) * 1000 + zoned.getMilliseconds();
      const next = Math.min(end, cursor + (HOUR_MS - intoHour));
      byHour[zoned.getHours()]! += (next - cursor) / 60_000;
      cursor = next;
    }
  }
  return byHour;
}

/**
 * Pure aggregation of study intervals into the history DTO. `intervals` may reach back further than the
 * window (the streak needs it); the window itself is `[today - days + 1, today]` in `tz`.
 */
export function aggregateHistory(
  intervals: readonly StudyInterval[],
  frozen: ReadonlySet<string>,
  streakDays: ReadonlyMap<string, number>,
  today: string,
  days: 30 | 90,
  tz: string,
): StudyHistoryDto {
  const from = addDays(today, -(days - 1));
  const windowIntervals = intervals.filter((i) => {
    const day = localDateOf(i.startedAt, tz);
    return day >= from && day <= today;
  });
  const dayMinutes = minutesByDay(windowIntervals, tz);

  const byDay: { date: string; minutes: number }[] = [];
  const byWeekday = new Array<number>(7).fill(0);
  let totalMinutes = 0;
  let activeDays = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const minutes = dayMinutes.get(date) ?? 0;
    byDay.push({ date, minutes });
    byWeekday[weekdayOf(date)]! += minutes;
    totalMinutes += minutes;
    if (minutes > 0) activeDays++;
  }

  const byHour = minutesByHour(windowIntervals, tz).map((m) => Math.round(m));
  const peak = Math.max(...byHour);
  // indexOf returns the earliest hour on ties.
  const bestHour = peak > 0 ? byHour.indexOf(peak) : null;

  const { current, longest } = computeStreaks(qualifyingDays(streakDays), frozen, today);
  const frozenDates = [...frozen].filter((d) => d >= from && d <= today).sort();

  return {
    days,
    from,
    to: today,
    totalMinutes,
    sessionCount: windowIntervals.length,
    activeDays,
    byDay,
    byWeekday,
    byHour,
    bestHour,
    streak: { current, longest, frozenDates },
  };
}
