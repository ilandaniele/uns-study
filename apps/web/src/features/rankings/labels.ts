import type { RankingCategory, RankingPeriod } from "@uns/contracts";

export const PERIOD_LABELS: Record<RankingPeriod, string> = {
  today: "Hoy",
  week: "Semana",
  month: "Mes",
  all: "Histórico",
};

export const CATEGORY_LABELS: Record<RankingCategory, string> = {
  study_time: "Tiempo estudiado",
  streak: "Racha",
  contribution: "Colaboración",
};

/** Formats a ranking entry's raw `value` per its category (minutes, days, or points). */
export function formatRankingValue(category: RankingCategory, value: number): string {
  if (category === "study_time") {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    if (hours === 0) return `${minutes} min`;
    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
  }
  if (category === "streak") {
    return value === 1 ? "1 día" : `${value} días`;
  }
  return value === 1 ? "1 punto" : `${value} puntos`;
}
