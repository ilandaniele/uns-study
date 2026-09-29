import type { SeatDto } from "@uns/contracts";

/** Durations offered by the "Todos los lugares ocupados" dialog, in minutes. */
export const MARK_ALL_OCCUPIED_DURATIONS = [30, 60, 120, 240] as const;
export const MARK_ALL_OCCUPIED_DEFAULT_MINUTES = 60;

/**
 * Seats the bulk action will flip: everything not already OCCUPIED. An UNCERTAIN seat with someone
 * checked in (open dispute) is also counted here — the API skips it, so the real count can be lower.
 */
export function countMarkableSeats(seats: Pick<SeatDto, "status">[]): number {
  return seats.filter((seat) => seat.status !== "OCCUPIED").length;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${minutes} min`;
}

export function markedToastMessage(count: number): string {
  return count === 1 ? "Marcamos 1 lugar como ocupado" : `Marcamos ${count} lugares como ocupados`;
}

export function confirmMessage(count: number): string {
  const subject = count === 1 ? "1 lugar libre o sin datos" : `${count} lugares libres o sin datos`;
  return `Se van a marcar ${subject} como ocupados durante`;
}
