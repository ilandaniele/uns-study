import { tableNameFromCode, type DisputeKind, type RoomMapDto, type SeatDto, type SeatStatus, type TableDto } from "@sala/contracts";
import { clockLabel } from "./checkin-duration";

/**
 * Human name for a table ("Mesa 4", "Barra entrada izquierda"); see `tableNameFromCode` in
 * `@sala/contracts`. Takes the table when known, else a code derived from the seat code.
 */
export function tableDisplayName(table: Pick<TableDto, "code" | "type"> | null, fallbackCode: string): string {
  return tableNameFromCode(table?.code ?? fallbackCode, table?.type);
}

/** "Mesa 4 · Asiento 3" / "Barra entrada izquierda · Lugar 2" — used wherever we used to show call numbers like M04·3. */
export function seatDisplayLabel(table: Pick<TableDto, "code" | "type"> | null, seatCode: string, seatNumber: number): string {
  const name = tableDisplayName(table, seatCode.split("-")[0] ?? seatCode);
  const unit = table?.type === "WALL_BAR" ? "Lugar" : "Asiento";
  return `${name} · ${unit} ${seatNumber}`;
}

/** Human label from a raw seat code alone ("M07-S05" -> "Mesa 7 · Asiento 5"), for lists without table data. */
export function seatCodeLabel(seatCode: string): string {
  const [tableCode = seatCode, seatPart = ""] = seatCode.split("-");
  const seatNumber = Number.parseInt(seatPart.replace(/\D/g, ""), 10);
  const isBar = tableCode.startsWith("B");
  const name = tableDisplayName({ code: tableCode, type: isBar ? "WALL_BAR" : "MAIN_TABLE" }, tableCode);
  return Number.isNaN(seatNumber) ? name : `${name} · ${isBar ? "Lugar" : "Asiento"} ${seatNumber}`;
}

/** Spanish label for a seat status, as shown in the seat detail panel. */
export function statusLabel(status: SeatStatus): string {
  switch (status) {
    case "FREE":
      return "Libre";
    case "OCCUPIED":
      return "Ocupado";
    case "UNCERTAIN":
      return "Dudoso";
    case "SAVED":
      return "Guardado";
    case "UNKNOWN":
      return "Sin datos";
  }
}

/** Spanish wording for a confidence score, deliberately vague per spec (§1: don't expose the math). */
export function confidenceWording(confidence: number): string {
  if (confidence >= 0.8) return "alta confianza";
  if (confidence >= 0.5) return "confianza media";
  return "baja confianza";
}

export interface SeatRecencyInput {
  status: SeatStatus;
  sourceSummary: string | null;
  lastUpdatedAt: string | null;
}

/**
 * "Actualizado hace N min/seg" style recency string, "Sin información reciente" for seats
 * with no real signal yet (UNKNOWN status, or a seed/reset-only `sourceSummary`), or null if
 * there is no data at all.
 */
export function recencyLabel(seat: SeatRecencyInput, now: Date = new Date()): string | null {
  const { status, sourceSummary, lastUpdatedAt } = seat;
  // A seat freed by a "Está guardado" dispute that resolved ABSENT — call out why, instead of the generic recency text.
  if (sourceSummary === "SAVED") {
    return "Estaba guardado, se liberó por votación";
  }
  if (status === "UNKNOWN" || sourceSummary === null || sourceSummary === "SEED" || sourceSummary === "DAILY_RESET") {
    return "Sin información reciente";
  }
  if (!lastUpdatedAt) return null;

  const diffMs = now.getTime() - new Date(lastUpdatedAt).getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "Actualizado hace instantes";
  if (diffMin === 1) return "Actualizado hace 1 minuto";
  if (diffMin < 60) return `Actualizado hace ${diffMin} minutos`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return "Actualizado hace 1 hora";
  if (diffHours < 24) return `Actualizado hace ${diffHours} horas`;

  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? "Actualizado hace 1 día" : `Actualizado hace ${diffDays} días`;
}

/** Spanish title for a dispute kind, as shown in the active-dispute card. */
export function disputeKindTitle(kind: DisputeKind): string {
  switch (kind) {
    case "CLAIM":
      return "Me senté acá";
    case "ABSENT":
      return "Esa persona no está";
    case "SAVED":
      return "Pedir que se libere";
  }
}

/** The three "¿Algo no cuadra?" options offered on an occupied/uncertain seat that isn't the caller's. */
export const DISPUTE_OPTIONS: { kind: DisputeKind; label: string; helper: string }[] = [
  { kind: "CLAIM", label: "Me senté acá", helper: "Sos vos quien está en este lugar, no quien figura." },
  { kind: "ABSENT", label: "Esa persona no está", helper: "El lugar figura ocupado, pero no hay nadie ahí." },
  { kind: "SAVED", label: "Pedir que se libere", helper: "Hay cosas guardadas hace 30 minutos o más y nadie vuelve." },
];

/**
 * "m:ss" countdown to a dispute's `closesAt`, floored at "0:00" once it has passed — used by the
 * active-dispute card and the incumbent challenge banner, both of which tick every second.
 */
export function disputeCountdownLabel(closesAt: string, now: Date = new Date()): string {
  const msLeft = Math.max(0, new Date(closesAt).getTime() - now.getTime());
  const totalSeconds = Math.ceil(msLeft / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Milliseconds until a dispute-derived banner (e.g. the incumbent challenge banner) should
 * auto-clear itself: `graceMs` after `closesAt`, in case the resolution socket event/refetch never
 * arrives. Never negative — a `closesAt` already in the past clears on the next tick.
 */
export function msUntilDisputeAutoClear(closesAt: string, now: Date = new Date(), graceMs = 5_000): number {
  return Math.max(0, new Date(closesAt).getTime() - now.getTime() + graceMs);
}

/** The "¿Algo no cuadra?" options to offer for a given seat (D1): CLAIM/ABSENT require a check-in
 *  as the occupancy source (they contest who's checked in, not what an observation implied); SAVED
 *  stays available for observation-only occupancy. None are offered once the seat is photo-verified. */
export function disputeOptionsFor(
  seat: Pick<SeatDto, "verified" | "sourceSummary">,
): typeof DISPUTE_OPTIONS {
  if (seat.verified) return [];
  const isCheckInSourced = seat.sourceSummary === "CHECK_IN";
  return DISPUTE_OPTIONS.filter((option) => option.kind === "SAVED" || isCheckInSourced);
}

/** "hasta 14:32" — local time the photo-verification protection on a check-in ends. */
export function verifiedUntilLabel(verificationExpiresAt: string): string {
  return `hasta ${clockLabel(verificationExpiresAt)}`;
}

export interface CheckInExpiryStatus {
  /** Whole minutes left, rounded up so "1 min" still means "some time left". */
  minutesLeft: number;
  /** True once 5 minutes or less remain — the "¿Seguís acá?" banner should show. */
  shouldPromptExtend: boolean;
}

/**
 * Derives the "¿Seguís acá?" banner state from a check-in's `expiresAt` (PRD §7).
 * Returns `null` once the check-in has expired — callers should treat that as
 * "refetch /me", not "keep showing 0 min".
 */
export function checkInExpiryStatus(expiresAt: string, now: Date = new Date()): CheckInExpiryStatus | null {
  const msLeft = new Date(expiresAt).getTime() - now.getTime();
  if (msLeft <= 0) return null;

  const minutesLeft = Math.ceil(msLeft / 60_000);
  return { minutesLeft, shouldPromptExtend: minutesLeft <= 5 };
}

/** "lado izquierdo" / "lado derecho" for a main table, from its horizontal center vs. the room's
 *  width — wall bars already carry their side in `tableDisplayName`, so this returns null for them. */
export function tableSideLabel(table: Pick<TableDto, "x" | "width" | "type"> | null, viewBoxWidth: number): string | null {
  if (!table || table.type === "WALL_BAR") return null;
  const centerX = table.x + table.width / 2;
  return centerX < viewBoxWidth / 2 ? "lado izquierdo" : "lado derecho";
}

export interface RoomCapacityGroup {
  /** "mesas" or "barras". */
  label: string;
  tableCount: number;
  seatsPerTable: number;
}

/**
 * Groups the room's tables by type (main tables vs. wall bars) with a seat count per table,
 * for the "Total: 108 lugares — 12 mesas (8 lugares c/u) = 96 …" breakdown on the left panel.
 * Derived from the actual map data rather than hardcoded, so it stays correct if the layout changes.
 */
export function roomCapacityBreakdown(map: Pick<RoomMapDto, "tables" | "seats">): RoomCapacityGroup[] {
  const seatCountByTable = new Map<string, number>();
  for (const seat of map.seats) {
    seatCountByTable.set(seat.tableId, (seatCountByTable.get(seat.tableId) ?? 0) + 1);
  }

  const groups = new Map<TableDto["type"], { count: number; seatsPerTable: number }>();
  for (const table of map.tables) {
    const seats = seatCountByTable.get(table.id) ?? 0;
    const existing = groups.get(table.type);
    if (existing) {
      existing.count += 1;
      existing.seatsPerTable = Math.max(existing.seatsPerTable, seats);
    } else {
      groups.set(table.type, { count: 1, seatsPerTable: seats });
    }
  }

  const order: TableDto["type"][] = ["MAIN_TABLE", "WALL_BAR"];
  const labels: Record<TableDto["type"], string> = { MAIN_TABLE: "mesas", WALL_BAR: "barras individuales" };
  return order
    .filter((type) => groups.has(type))
    .map((type) => {
      const group = groups.get(type)!;
      return { label: labels[type], tableCount: group.count, seatsPerTable: group.seatsPerTable };
    });
}

/**
 * Toast copy for a `seat:freed-alert` event: "Se liberó Mesa 4 · Asiento 2" for a single seat, or
 * "Se liberaron 3 lugares" for a batch — mirrors the API's push notification wording
 * (`apps/api/src/notifications/notification.service.ts`) so the in-app toast and the push a user
 * gets on another device read the same way.
 */
export function freedSeatsToastMessage(map: Pick<RoomMapDto, "seats" | "tables">, seatIds: string[]): string {
  if (seatIds.length !== 1) return `Se liberaron ${seatIds.length} lugares`;
  const seat = map.seats.find((s) => s.id === seatIds[0]);
  if (!seat) return "Se liberó un lugar";
  const table = map.tables.find((t) => t.id === seat.tableId) ?? null;
  return `Se liberó ${seatDisplayLabel(table, seat.code, seat.seatNumber)}`;
}

/** "Hoy, 28 sep 2026" in America/Argentina/Buenos_Aires-style Spanish, for the left panel's "Abierto · …" line. */
export function todayLabel(now: Date = new Date()): string {
  const formatted = now.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
  return `Hoy, ${formatted.replace(".", "")}`;
}
