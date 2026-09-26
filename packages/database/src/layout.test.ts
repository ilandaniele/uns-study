import { describe, expect, it } from "vitest";
import { generateRoomLayout, ROOM_VIEWBOX } from "./layout.js";

describe("generateRoomLayout", () => {
  const layout = generateRoomLayout();

  it("creates 12 main tables and 4 wall bars", () => {
    const mainTables = layout.tables.filter((t) => t.type === "MAIN_TABLE");
    const bars = layout.tables.filter((t) => t.type === "WALL_BAR");
    expect(mainTables).toHaveLength(12);
    expect(bars).toHaveLength(4);
  });

  it("creates 108 seats total", () => {
    expect(layout.seats).toHaveLength(108);
  });

  it("has unique table and seat codes", () => {
    const tableCodes = layout.tables.map((t) => t.code);
    const seatCodes = layout.seats.map((s) => s.code);
    expect(new Set(tableCodes).size).toBe(tableCodes.length);
    expect(new Set(seatCodes).size).toBe(seatCodes.length);
    expect(seatCodes).toContain("M01-S01");
    expect(seatCodes).toContain("M12-S08");
    expect(seatCodes).toContain("B01-S01");
    expect(seatCodes).toContain("B04-S03");
  });

  it("places wall bars vertically against the side walls", () => {
    const byCode = Object.fromEntries(layout.tables.map((t) => [t.code, t]));
    const b01 = byCode["B01"]!;
    const b02 = byCode["B02"]!;
    const b03 = byCode["B03"]!;
    const b04 = byCode["B04"]!;

    // B01/B03 near the left wall, B02/B04 near the right wall.
    expect(b01.x).toBeCloseTo(b03.x, 5);
    expect(b02.x).toBeCloseTo(b04.x, 5);
    expect(b01.x).toBeLessThan(b02.x);

    // Bars are vertical (taller than wide).
    for (const bar of [b01, b02, b03, b04]) {
      expect(bar.height).toBeGreaterThan(bar.width);
    }

    // B01/B02 sit in the lower half of the room (near the entrance).
    expect(b01.y).toBeGreaterThan(ROOM_VIEWBOX.height / 2);
    expect(b02.y).toBeGreaterThan(ROOM_VIEWBOX.height / 2);
    // B03/B04 sit in the upper half (near the back wall).
    expect(b03.y).toBeLessThan(ROOM_VIEWBOX.height / 2);
    expect(b04.y).toBeLessThan(ROOM_VIEWBOX.height / 2);
  });

  it("keeps every element inside the 0..1000 x 0..1600 viewBox", () => {
    expect(layout.viewBox).toEqual({ width: 1000, height: 1600 });
    for (const t of layout.tables) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x + t.width).toBeLessThanOrEqual(1000);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y + t.height).toBeLessThanOrEqual(1600);
    }
    for (const s of layout.seats) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(1000);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(1600);
    }
  });

  it("keeps furniture from overlapping and leaves a central aisle", () => {
    const t = layout.tables;
    for (let i = 0; i < t.length; i++) {
      for (let j = i + 1; j < t.length; j++) {
        const a = t[i]!;
        const b = t[j]!;
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap, `${a.code} overlaps ${b.code}`).toBe(false);
      }
    }
    const m01 = t.find((x) => x.code === "M01")!;
    const m07 = t.find((x) => x.code === "M07")!;
    expect(m07.x - (m01.x + m01.width)).toBeGreaterThanOrEqual(120);
  });
});
