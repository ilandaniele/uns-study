import type { SeatDto } from "@sala/contracts";

/** Below this the "people checked the room today" line is hidden: a small number reads as an empty room. */
export const MIN_VISITORS_TO_SHOW = 5;

type SeatSignal = Pick<SeatDto, "status" | "sourceSummary" | "lastUpdatedAt">;

/**
 * Latest `lastUpdatedAt` across seats carrying a real report (ignores the seed/daily-reset stamps
 * that touch every seat at once), as epoch ms, or null when nothing has been reported yet.
 */
export function latestSeatUpdateMs(seats: SeatSignal[]): number | null {
  let latest: number | null = null;
  for (const seat of seats) {
    if (!seat.lastUpdatedAt || seat.status === "UNKNOWN") continue;
    if (seat.sourceSummary === null || seat.sourceSummary === "SEED" || seat.sourceSummary === "DAILY_RESET") continue;
    const ms = Date.parse(seat.lastUpdatedAt);
    if (Number.isFinite(ms) && (latest === null || ms > latest)) latest = ms;
  }
  return latest;
}

/** "Actualizado recién" / "Actualizado hace 2 min" / "hace 3 h"; null when there is no signal or it is over a day old. */
export function updatedAgoLabel(latestMs: number | null, now: Date = new Date()): string | null {
  if (latestMs === null) return null;
  const minutes = Math.floor(Math.max(0, now.getTime() - latestMs) / 60_000);
  if (minutes < 1) return "Actualizado recién";
  if (minutes < 60) return `Actualizado hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Actualizado hace ${hours} h`;
  return null;
}

/** "43 personas consultaron la sala hoy", or null while the number is too small to be encouraging. */
export function visitorsTodayLabel(visitors: number | null): string | null {
  if (visitors === null || visitors < MIN_VISITORS_TO_SHOW) return null;
  return `${visitors} personas consultaron la sala hoy`;
}

/** "Ayudaste a actualizar 8 lugares hoy. ¡Gracias!", or null when the user hasn't contributed today. */
export function contributionsTodayLabel(contributions: number | null): string | null {
  if (!contributions || contributions < 1) return null;
  return `Ayudaste a actualizar ${contributions === 1 ? "1 lugar" : `${contributions} lugares`} hoy. ¡Gracias!`;
}
