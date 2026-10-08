import { describe, expect, it } from "vitest";
import { normalizeAmbient } from "./focus-audio";

describe("normalizeAmbient", () => {
  it("migrates the retired presets", () => {
    expect(normalizeAmbient("white")).toBe("rain");
    expect(normalizeAmbient("pink")).toBe("rain");
    expect(normalizeAmbient("brown")).toBe("brown");
  });

  it("keeps current presets", () => {
    for (const k of ["off", "rain", "brown", "ocean", "fire"]) expect(normalizeAmbient(k)).toBe(k);
  });

  it("falls back to off for unknown values", () => {
    expect(normalizeAmbient("jazz")).toBe("off");
    expect(normalizeAmbient(undefined)).toBe("off");
    expect(normalizeAmbient(3)).toBe("off");
  });
});
