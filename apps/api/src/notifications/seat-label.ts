import type { TableType } from "@uns/contracts";

const BAR_NAMES: Record<string, string> = {
  B01: "Barra entrada izquierda",
  B02: "Barra entrada derecha",
  B03: "Barra fondo izquierda",
  B04: "Barra fondo derecha",
};

/**
 * Server-side mirror of the web app's table-naming rules (`apps/web/src/features/room/format.ts`),
 * kept in sync by hand rather than shared — the two apps don't share a UI/formatting package — so
 * push notification text reads the same as the room map ("Mesa 4", "Barra entrada izquierda").
 */
export function tableDisplayName(code: string, type: TableType): string {
  if (type === "WALL_BAR" || code.startsWith("B")) return BAR_NAMES[code] ?? `Barra ${code}`;
  const number = Number.parseInt(code.replace(/\D/g, ""), 10);
  return Number.isNaN(number) ? code : `Mesa ${number}`;
}

/** "Mesa 4 · Asiento 2" / "Barra entrada izquierda · Lugar 1". */
export function seatLabel(tableCode: string, tableType: TableType, seatNumber: number): string {
  const name = tableDisplayName(tableCode, tableType);
  const unit = tableType === "WALL_BAR" ? "Lugar" : "Asiento";
  return `${name} · ${unit} ${seatNumber}`;
}
