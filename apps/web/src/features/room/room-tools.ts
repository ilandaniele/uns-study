import type { RoomMapDto, SeatDto } from "@sala/contracts";

/**
 * "Buscar lugar libre": the favorite seat when it is free; otherwise the free seat at the table
 * with the most free seats (more elbow room, fewer people to ask), ties broken by the most
 * confident report and then by seat code so the pick is stable. `null` when nothing is free.
 */
export function pickFreeSeat(map: Pick<RoomMapDto, "seats">, favoriteSeatId: string | null = null): SeatDto | null {
  const free = map.seats.filter((seat) => seat.status === "FREE");
  if (free.length === 0) return null;
  const favorite = favoriteSeatId ? free.find((seat) => seat.id === favoriteSeatId) : undefined;
  if (favorite) return favorite;

  const freeByTable = new Map<string, number>();
  for (const seat of free) freeByTable.set(seat.tableId, (freeByTable.get(seat.tableId) ?? 0) + 1);

  return [...free].sort(
    (a, b) =>
      (freeByTable.get(b.tableId) ?? 0) - (freeByTable.get(a.tableId) ?? 0) ||
      b.confidence - a.confidence ||
      a.code.localeCompare(b.code),
  )[0]!;
}

/** Text for "Compartir": a one-line room snapshot plus the link. */
export function roomShareText(roomName: string, summary: RoomMapDto["summary"]): string {
  const free = summary.free === 1 ? "1 lugar libre" : `${summary.free} lugares libres`;
  return `${roomName}: ${free} de ${summary.total} ahora mismo.`;
}
