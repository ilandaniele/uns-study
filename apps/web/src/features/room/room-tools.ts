import type { RoomMapDto, SeatDto } from "@sala/contracts";

/**
 * "Buscar lugar libre": the first favorite seat (in the viewer's order) that is free; otherwise the free seat at the table
 * with the most free seats (more elbow room, fewer people to ask), ties broken by the most
 * confident report and then by seat code so the pick is stable. `null` when nothing is free.
 */
export function pickFreeSeat(map: Pick<RoomMapDto, "seats">, favoriteSeatIds: readonly string[] = []): SeatDto | null {
  const free = map.seats.filter((seat) => seat.status === "FREE");
  if (free.length === 0) return null;
  for (const id of favoriteSeatIds) {
    const favorite = free.find((seat) => seat.id === id);
    if (favorite) return favorite;
  }

  const freeByTable = new Map<string, number>();
  for (const seat of free) freeByTable.set(seat.tableId, (freeByTable.get(seat.tableId) ?? 0) + 1);

  return [...free].sort(
    (a, b) =>
      (freeByTable.get(b.tableId) ?? 0) - (freeByTable.get(a.tableId) ?? 0) ||
      b.confidence - a.confidence ||
      a.code.localeCompare(b.code),
  )[0]!;
}

/** Text for "Compartir estado de la sala": how many seats are free right now, plus the live link. */
export function roomShareText(summary: RoomMapDto["summary"], url: string): string {
  const headline =
    summary.free <= 0 ? "La sala está llena ahora mismo." : summary.free === 1 ? "Hay 1 lugar libre ahora en la sala de estudio." : `Hay ${summary.free} lugares libres ahora en la sala de estudio.`;
  return `${headline} Miralo en vivo: ${url}`;
}
