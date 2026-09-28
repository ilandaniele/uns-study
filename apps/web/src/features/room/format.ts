import type { DisputeKind, RoomMapDto, SeatStatus, TableDto } from "@uns/contracts";

const BAR_NAMES: Record<string, string> = {
  B01: "Barra entrada izquierda",
  B02: "Barra entrada derecha",
  B03: "Barra fondo izquierda",
  B04: "Barra fondo derecha",
};

/**
 * Human, non-"call number" name for a table: "Mesa 4" for main tables, "Barra entrada
 * izquierda" etc. for wall bars. Falls back to the raw code if it doesn't match the known
 * layout (defensive — the layout is generated, but this keeps the UI readable either way).
 */
export function tableDisplayName(table: Pick<TableDto, "code" | "type"> | null, fallbackCode: string): string {
  const code = table?.code ?? fallbackCode;
  if (table?.type === "WALL_BAR" || code.startsWith("B")) {
    return BAR_NAMES[code] ?? `Barra ${code}`;
  }
  const number = Number.parseInt(code.replace(/\D/g, ""), 10);
  return Number.isNaN(number) ? code : `Mesa ${number}`;
}

/** "Mesa 4 · Asiento 3" / "Barra entrada izquierda · Lugar 2" — used wherever we used to show call numbers like M04·3. */
export function seatDisplayLabel(table: Pick<TableDto, "code" | "type"> | null, seatCode: string, seatNumber: number): string {
  const name = tableDisplayName(table, seatCode.split("-")[0] ?? seatCode);
  const unit = table?.type === "WALL_BAR" ? "Lugar" : "Asiento";
  return `${name} · ${unit} ${seatNumber}`;
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
    case "UNKNOWN":
      return "Sin datos";
  }
}

/** Spanish wording for a confidence score, deliberately vague per spec (§1: don't expose the math). */
export function confidenceWording(confidence: number): string {
  if (confidence >= 0.8) return "alta confianza";
  if (confidence >= 0.5) return "información reciente";
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
    return "Estaba guardado — se liberó por votación";
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
      return "Está guardado";
  }
}

/** The three "¿Algo no cuadra?" options offered on an occupied/uncertain seat that isn't the caller's. */
export const DISPUTE_OPTIONS: { kind: DisputeKind; label: string; helper: string }[] = [
  { kind: "CLAIM", label: "Me senté acá", helper: "Sos vos quien está en este lugar, no quien figura." },
  { kind: "ABSENT", label: "Esa persona no está", helper: "El lugar figura ocupado, pero no hay nadie ahí." },
  { kind: "SAVED", label: "Está guardado", helper: "Hay pertenencias pero nadie sentado hace 30 minutos o más." },
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

/** "hasta 14:32" — local time the photo-verification protection on a check-in ends. */
export function verifiedUntilLabel(verificationExpiresAt: string): string {
  const time = new Date(verificationExpiresAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return `hasta ${time}`;
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

/** "Hoy, 28 sep 2026" in America/Argentina/Buenos_Aires-style Spanish, for the left panel's "Abierto · …" line. */
export function todayLabel(now: Date = new Date()): string {
  const formatted = now.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
  return `Hoy, ${formatted.replace(".", "")}`;
}
