import type { RankingCategory, RankingPeriod } from "@sala/contracts";

export const PERIOD_LABELS: Record<RankingPeriod, string> = {
  today: "Hoy",
  week: "Semana",
  month: "Mes",
  all: "Histórico",
};

export const CATEGORY_LABELS: Record<RankingCategory, string> = {
  study_time: "Horas",
  streak: "Racha",
  contribution: "Colaboración",
};

/** One-line explanation of what each category measures, shown under the title. */
export const CATEGORY_DESCRIPTIONS: Record<RankingCategory, string> = {
  study_time: "Quién pasó más tiempo estudiando en la sala.",
  streak: "Días seguidos yendo a estudiar.",
  contribution: "Quién más ayudó a mantener el mapa al día.",
};

const PERIOD_EMPTY: Record<Exclude<RankingPeriod, "all">, string> = {
  today: "hoy",
  week: "esta semana",
  month: "este mes",
};

export function emptyRankingMessage(period: RankingPeriod): string {
  return period === "all" ? "Todavía no hay nadie en el ranking." : `Nadie sumó ${PERIOD_EMPTY[period]}.`;
}

/** Formats a ranking entry's raw `value` per its category (minutes, days, or points). */
export function formatRankingValue(category: RankingCategory, value: number): string {
  if (category === "study_time") {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    if (hours === 0) return `${minutes}m`;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  if (category === "streak") {
    return value === 1 ? "1 día" : `${value} días`;
  }
  return value === 1 ? "1 punto" : `${value} puntos`;
}
