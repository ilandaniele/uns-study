/** A local day counts toward a streak (and a ranking streak) with at least this many verified minutes. */
export const STREAK_MIN_MINUTES = 30;
/** Streaks only look back this many days (longer streaks are capped at what the window can prove). */
export const STREAK_LOOKBACK_DAYS = 400;

const DAY_MS = 86_400_000;

/** YYYY-MM-DD arithmetic on calendar dates, independent of the host timezone. */
export function addDays(localDate: string, delta: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayOf(localDate: string): number {
  return (new Date(`${localDate}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The Monday..Sunday week (inclusive local dates) that contains `today`. */
export function artWeekBounds(today: string): { start: string; end: string } {
  const start = addDays(today, -weekdayOf(today));
  return { start, end: addDays(start, 6) };
}

/** Days whose minutes reach `minMinutes`. */
export function qualifyingDays(byDay: ReadonlyMap<string, number>, minMinutes: number = STREAK_MIN_MINUTES): Set<string> {
  const out = new Set<string>();
  for (const [day, minutes] of byDay) if (minutes >= minMinutes) out.add(day);
  return out;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
}

/**
 * Consecutive-day streaks over the qualifying days; frozen days count as studied.
 * `current` is the run ending today or yesterday (0 when the last studied day is older).
 */
export function computeStreaks(qualifying: ReadonlySet<string>, frozen: ReadonlySet<string>, today: string): { current: number; longest: number } {
  const studied = [...new Set([...qualifying, ...frozen])].sort();
  if (studied.length === 0) return { current: 0, longest: 0 };

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of studied) {
    run = prev !== null && daysBetween(day, prev) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = day;
  }

  // `run` is now the length of the run that ends on the most recent studied day.
  const gap = daysBetween(today, studied[studied.length - 1]!);
  const current = gap === 0 || gap === 1 ? run : 0;
  return { current, longest };
}
