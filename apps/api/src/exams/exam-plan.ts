import { addDays } from "../study-history/streak.js";

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to` (YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-31). */
export function isRealLocalDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && addDays(value, 0) === value;
}

/**
 * Countdown and daily study plan for one exam. `dailyPlanMinutes` is null for a past exam or once the
 * target is met; on exam day itself the whole remainder is due today (divisor floors at 1).
 */
export function examPlan(i: { targetHours: number; studiedMinutes: number; today: string; examDate: string }): {
  daysLeft: number;
  dailyPlanMinutes: number | null;
} {
  const daysLeft = daysBetween(i.today, i.examDate);
  const remaining = i.targetHours * 60 - i.studiedMinutes;
  if (daysLeft < 0 || remaining <= 0) return { daysLeft, dailyPlanMinutes: null };
  return { daysLeft, dailyPlanMinutes: Math.ceil(remaining / Math.max(daysLeft, 1)) };
}
