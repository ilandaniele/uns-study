import type { SeatStatus, TableDto } from "@uns/contracts";

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
