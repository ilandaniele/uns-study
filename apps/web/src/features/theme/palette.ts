export type Palette = "default" | "violeta" | "bosque" | "atardecer";

export const PALETTE_STORAGE_KEY = "sala-palette";

export const PALETTES: readonly Palette[] = ["default", "violeta", "bosque", "atardecer"];

export const PALETTE_META: Record<Palette, { label: string; swatch: string }> = {
  default: { label: "Petróleo", swatch: "#0f6e7e" },
  violeta: { label: "Violeta", swatch: "#6a3fc0" },
  bosque: { label: "Bosque", swatch: "#2e7340" },
  atardecer: { label: "Atardecer", swatch: "#b1432a" },
};

/** Whitelist parse: anything that is not a known palette becomes `"default"`. */
export function parsePalette(value: unknown): Palette {
  return typeof value === "string" && (PALETTES as readonly string[]).includes(value) ? (value as Palette) : "default";
}
