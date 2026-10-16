import { fromZonedTime } from "date-fns-tz";
import { FORECAST_END_HOUR, FORECAST_START_HOUR, type ForecastData } from "@sala/contracts";
import { weekdayOf } from "../study-history/streak.js";

const HOUR_MS = 60 * 60 * 1000;
export const FORECAST_SLOTS = FORECAST_END_HOUR - FORECAST_START_HOUR + 1;

export interface ForecastCheckIn {
  startedAt: Date;
  endAt: Date;
}

/** `weekdays` x `FORECAST_SLOTS` grid filled with `null`. */
export function emptyForecastGrid(): (number | null)[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: FORECAST_SLOTS }, () => null as number | null));
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Average occupancy ratio (0..1) per weekday and hour (07..23 local) over the given local days.
 * Per day and hour: concurrency = overlapping check-in minutes / 60, ratio = concurrency / seatCount
 * (clamped); each weekday then averages its sample days. A weekday with no sample day stays null.
 */
export function buildForecastGrid(checkIns: readonly ForecastCheckIn[], seatCount: number, localDays: readonly string[], tz: string): ForecastData {
  const sums = Array.from({ length: 7 }, () => new Array<number>(FORECAST_SLOTS).fill(0));
  const samples = new Array<number>(7).fill(0);
  const spans = checkIns.map((c) => [c.startedAt.getTime(), c.endAt.getTime()] as const).filter(([s, e]) => e > s);

  for (const day of localDays) {
    const weekday = weekdayOf(day);
    samples[weekday]! += 1;
    for (let slot = 0; slot < FORECAST_SLOTS; slot++) {
      const hour = FORECAST_START_HOUR + slot;
      const start = fromZonedTime(`${day}T${String(hour).padStart(2, "0")}:00:00`, tz).getTime();
      let overlap = 0;
      for (const [s, e] of spans) overlap += overlapMs(s, e, start, start + HOUR_MS);
      const ratio = seatCount > 0 ? overlap / HOUR_MS / seatCount : 0;
      sums[weekday]![slot]! += Math.min(1, Math.max(0, ratio));
    }
  }

  const grid = emptyForecastGrid();
  for (let weekday = 0; weekday < 7; weekday++) {
    const n = samples[weekday]!;
    if (n === 0) continue;
    for (let slot = 0; slot < FORECAST_SLOTS; slot++) {
      grid[weekday]![slot] = Math.round((sums[weekday]![slot]! / n) * 100) / 100;
    }
  }
  return { sampleDays: localDays.length, grid };
}
