import { WEEKLY_GOAL_MAX_MINUTES, WEEKLY_GOAL_MIN_MINUTES } from "@sala/contracts";

/** Goal choices in whole hours, 1 h up to the 70 h (4200 min) the API accepts. */
export const GOAL_HOUR_OPTIONS: number[] = Array.from(
  { length: WEEKLY_GOAL_MAX_MINUTES / 60 - WEEKLY_GOAL_MIN_MINUTES / 60 + 1 },
  (_, i) => WEEKLY_GOAL_MIN_MINUTES / 60 + i,
);

/** Fraction of the goal reached, clamped to 0..1 (0 without a usable goal). */
export function progressRatio(studiedMinutes: number, goalMinutes: number | null): number {
  if (goalMinutes === null || goalMinutes <= 0) return 0;
  return Math.min(1, Math.max(0, studiedMinutes / goalMinutes));
}

/** "2 h 30 min", "45 min" or "3 h". */
export function formatHM(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** The goal as a whole-hour option value; a goal that is not a whole number of hours rounds to the nearest option. */
export function goalToHours(goalMinutes: number): number {
  const hours = Math.round(goalMinutes / 60);
  return Math.min(GOAL_HOUR_OPTIONS[GOAL_HOUR_OPTIONS.length - 1]!, Math.max(GOAL_HOUR_OPTIONS[0]!, hours));
}
