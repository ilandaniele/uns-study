import type { TableType } from "./index";

const BAR_NAMES: Record<string, string> = {
  B01: "Barra entrada izquierda",
  B02: "Barra entrada derecha",
  B03: "Barra fondo izquierda",
  B04: "Barra fondo derecha",
};

/**
 * Human, non-"call number" name for a table: "Mesa 4" for main tables, "Barra entrada izquierda"
 * etc. for wall bars. Falls back to the raw code if it doesn't match the known layout. Shared by
 * the web room map and the API's push notification text so both read the same.
 */
export function tableNameFromCode(code: string, type: TableType | undefined): string {
  if (type === "WALL_BAR" || code.startsWith("B")) return BAR_NAMES[code] ?? `Barra ${code}`;
  const number = Number.parseInt(code.replace(/\D/g, ""), 10);
  return Number.isNaN(number) ? code : `Mesa ${number}`;
}

/** "Mesa 4 · Asiento 2" / "Barra entrada izquierda · Lugar 1". */
export function seatLabel(tableCode: string, tableType: TableType, seatNumber: number): string {
  const unit = tableType === "WALL_BAR" ? "Lugar" : "Asiento";
  return `${tableNameFromCode(tableCode, tableType)} · ${unit} ${seatNumber}`;
}
