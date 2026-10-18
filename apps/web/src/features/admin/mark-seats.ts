import { ADMIN_MARK_SEATS_MAX } from "@sala/contracts";

export type MarkSeatsStatus = "OCCUPIED" | "FREE";

/** Adds the seat to the selection, or removes it when already there. Caps at the API's per-request limit. */
export function toggleSeatSelection(selection: ReadonlySet<string>, seatId: string): Set<string> {
  const next = new Set(selection);
  if (next.has(seatId)) next.delete(seatId);
  else if (next.size < ADMIN_MARK_SEATS_MAX) next.add(seatId);
  return next;
}

export function selectionLabel(count: number): string {
  if (count === 0) return "Tocá los lugares en el mapa";
  return count === 1 ? "1 lugar elegido" : `${count} lugares elegidos`;
}

export function markSeatsToastMessage(status: MarkSeatsStatus, count: number, skipped: number): string {
  const what = status === "OCCUPIED" ? "ocupado" : "libre";
  const marked = count === 1 ? `Marcamos 1 lugar como ${what}` : `Marcamos ${count} lugares como ${what}s`;
  if (skipped === 0) return marked;
  const left = skipped === 1 ? "1 no cambió (tiene a alguien sentado)" : `${skipped} no cambiaron (tienen a alguien sentado)`;
  return `${marked}. ${left}`;
}
