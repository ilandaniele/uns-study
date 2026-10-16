import { SEAT_WATCH_MAX_SEATS, type SeatDto } from "@sala/contracts";

export type SeatWatchMode = "seat" | "table";

/** Seat ids to send for a watch: just this seat, or every seat at its table (capped at the API limit, this seat first). */
export function watchSeatIdsFor(mode: SeatWatchMode, seat: Pick<SeatDto, "id">, tableSeats: readonly Pick<SeatDto, "id">[]): string[] {
  if (mode === "seat") return [seat.id];
  const ids = new Set([seat.id, ...tableSeats.map((s) => s.id)]);
  return [...ids].slice(0, SEAT_WATCH_MAX_SEATS);
}

/** Whether `watched` is exactly the set of ids `mode` would send (order-insensitive). */
export function isWatchingMode(watched: readonly string[], mode: SeatWatchMode, seat: Pick<SeatDto, "id">, tableSeats: readonly Pick<SeatDto, "id">[]): boolean {
  const wanted = watchSeatIdsFor(mode, seat, tableSeats);
  return wanted.length === watched.length && wanted.every((id) => watched.includes(id));
}
