import { describe, expect, it } from "vitest";
import { GARDEN_PLOT_ORDER, gardenPlotPosition } from "./garden-layout";

describe("garden river projection", () => {
  it("preserves 25 numbered plots, leaves room for the stream, and stays inside the scene", () => {
    expect([...GARDEN_PLOT_ORDER].map(p => p.plot).sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i));
    expect(gardenPlotPosition(0)).toMatchObject({ x: 288, y: 99 });
    expect(gardenPlotPosition(2)).toMatchObject({ x: 408, y: 161 });
    expect(gardenPlotPosition(24)).toMatchObject({ x: 312, y: 311 });
    for (const p of GARDEN_PLOT_ORDER) {
      expect(p.x - 48).toBeGreaterThanOrEqual(0);
      expect(p.x + 48).toBeLessThanOrEqual(600);
      expect(p.y - 85).toBeGreaterThanOrEqual(0);
      expect(p.y + 25).toBeLessThan(430);
    }
    for (let row = 0; row < 5; row++) {
      const left = gardenPlotPosition(row * 5 + 1), right = gardenPlotPosition(row * 5 + 2);
      expect(right.x - left.x).toBe(72);
      expect(right.y - left.y).toBe(37);
    }
  });
});
