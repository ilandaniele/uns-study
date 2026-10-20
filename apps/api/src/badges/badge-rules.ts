import { fromZonedTime } from "date-fns-tz";
import type { BadgeDto, BadgeId } from "@sala/contracts";
import { localDateOf } from "../common/dates.js";
import type { StudyInterval } from "../study-history/study-intervals.js";

export interface BadgeInput {
  totalMinutes: number;
  sessionCount: number;
  longestStreak: number;
  /** Any session started before 08:00 local. */
  hasEarly: boolean;
  /** Any study minutes after 21:00 local. */
  hasLate: boolean;
}

export const EARLY_BIRD_BEFORE_HOUR = 8;
export const NIGHT_OWL_AFTER_HOUR = 21;

interface BadgeRule {
  id: BadgeId;
  title: string;
  description: string;
  /** Current value and the value that earns the badge. */
  measure: (input: BadgeInput) => { value: number; target: number };
}

const hours = (h: number) => h * 60;

const RULES: readonly BadgeRule[] = [
  { id: "first_session", title: "Primera sesión", description: "Estudiaste por primera vez en la sala.", measure: (i) => ({ value: i.sessionCount, target: 1 }) },
  { id: "hours_10", title: "10 horas", description: "Sumaste 10 horas de estudio.", measure: (i) => ({ value: i.totalMinutes, target: hours(10) }) },
  { id: "hours_50", title: "50 horas", description: "Sumaste 50 horas de estudio.", measure: (i) => ({ value: i.totalMinutes, target: hours(50) }) },
  { id: "hours_100", title: "100 horas", description: "Sumaste 100 horas de estudio.", measure: (i) => ({ value: i.totalMinutes, target: hours(100) }) },
  { id: "streak_7", title: "Racha de 7 días", description: "Estudiaste 7 días seguidos.", measure: (i) => ({ value: i.longestStreak, target: 7 }) },
  { id: "streak_30", title: "Racha de 30 días", description: "Estudiaste 30 días seguidos.", measure: (i) => ({ value: i.longestStreak, target: 30 }) },
  { id: "early_bird", title: "Madrugador", description: "Empezaste a estudiar antes de las 8.", measure: (i) => ({ value: i.hasEarly ? 1 : 0, target: 1 }) },
  { id: "night_owl", title: "Nocturno", description: "Estudiaste después de las 21.", measure: (i) => ({ value: i.hasLate ? 1 : 0, target: 1 }) },
];

/** Every badge with its earned flag and 0..1 progress, in display order. */
export function evaluateBadges(input: BadgeInput): BadgeDto[] {
  return RULES.map((rule) => {
    const { value, target } = rule.measure(input);
    const progress = Math.min(1, Math.max(0, value / target));
    return { id: rule.id, title: rule.title, description: rule.description, earned: value >= target, progress };
  });
}

/** True when any interval starts before `EARLY_BIRD_BEFORE_HOUR` local time. */
export function hasEarlyStart(intervals: readonly StudyInterval[], tz: string): boolean {
  return intervals.some((interval) => {
    if (interval.manual) return false; // an admin credit has no real start time
    const day = localDateOf(interval.startedAt, tz);
    return interval.startedAt.getTime() < fromZonedTime(`${day}T${String(EARLY_BIRD_BEFORE_HOUR).padStart(2, "0")}:00:00`, tz).getTime();
  });
}

/** True when any interval runs past `NIGHT_OWL_AFTER_HOUR` local time on the day it started. */
export function hasLateMinutes(intervals: readonly StudyInterval[], tz: string): boolean {
  return intervals.some((interval) => {
    if (interval.minutes <= 0 || interval.manual) return false;
    const start = interval.startedAt.getTime();
    const end = start + interval.minutes * 60_000;
    const day = localDateOf(interval.startedAt, tz);
    const lateStart = fromZonedTime(`${day}T${NIGHT_OWL_AFTER_HOUR}:00:00`, tz).getTime();
    return end > lateStart;
  });
}
