import type { BadgeDto, StreakDto } from "@sala/contracts";

const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;

/** "1 día" / "3 días". */
export function daysLabel(count: number): string {
  return `${count} ${count === 1 ? "día" : "días"}`;
}

/** Progress line under a badge; never reads 100 % unless the badge is earned. */
export function badgeProgressText(badge: Pick<BadgeDto, "earned" | "progress">): string {
  if (badge.earned) return "¡Conseguida!";
  const percent = Math.floor(Math.min(1, Math.max(0, badge.progress)) * 100);
  return percent > 0 ? `${percent} % completado` : "Todavía no";
}

/** "mié 14/1" for a YYYY-MM-DD local date. */
export function freezeDateLabel(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number) as [number, number, number];
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return `${WEEKDAYS[weekday]} ${day}/${month}`;
}

/** Streak headline: "Racha actual: 3 días · Mejor: 12 días". */
export function streakSummary(streak: Pick<StreakDto, "current" | "longest">): string {
  return `Racha actual: ${daysLabel(streak.current)} · Mejor: ${daysLabel(streak.longest)}`;
}

/** Why the freeze control is disabled, or null when it can be used. */
export function freezeBlockedReason(streak: Pick<StreakDto, "freezeAvailableThisMonth" | "freezableDates">): string | null {
  if (!streak.freezeAvailableThisMonth) return "Ya usaste el congelamiento de este mes.";
  if (streak.freezableDates.length === 0) return "No hay días de la última semana para congelar.";
  return null;
}
