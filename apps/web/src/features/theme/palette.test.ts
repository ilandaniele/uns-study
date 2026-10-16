import { describe, expect, it } from "vitest";
import { PALETTE_META, PALETTES, parsePalette } from "./palette";

describe("parsePalette", () => {
  it("accepts every known palette", () => {
    for (const p of PALETTES) expect(parsePalette(p)).toBe(p);
  });
  it("falls back to default for unknown or non-string values", () => {
    expect(parsePalette("rosa")).toBe("default");
    expect(parsePalette(null)).toBe("default");
    expect(parsePalette(3)).toBe("default");
  });
  it("has a label and swatch for each palette", () => {
    for (const p of PALETTES) expect(PALETTE_META[p].label).not.toBe("");
  });
});
