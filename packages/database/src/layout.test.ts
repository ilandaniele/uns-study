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

  it("places back bars vertically on the side walls and entrance bars horizontally on the front wall", () => {
    const byCode = Object.fromEntries(layout.tables.map((t) => [t.code, t]));
    const b01 = byCode["B01"]!;
    const b02 = byCode["B02"]!;
    const b03 = byCode["B03"]!;
    const b04 = byCode["B04"]!;

    // Back bars: vertical (taller than wide), B03 left / B04 right, in the upper half.
    for (const bar of [b03, b04]) {
      expect(bar.height).toBeGreaterThan(bar.width);
      expect(bar.y).toBeLessThan(ROOM_VIEWBOX.height / 2);
    }
    expect(b03.x).toBeLessThan(b04.x);

    // Entrance bars: horizontal (wider than tall), hugging the front wall, one each side of the door.
    for (const bar of [b01, b02]) {
      expect(bar.width).toBeGreaterThan(bar.height);
      expect(bar.y).toBeGreaterThan(ROOM_VIEWBOX.height - 150);
      expect(bar.y + bar.height).toBeLessThanOrEqual(ROOM_VIEWBOX.height);
    }
    const doorLeft = ROOM_VIEWBOX.width / 2 - 90;
    const doorRight = ROOM_VIEWBOX.width / 2 + 90;
    expect(b01.x + b01.width).toBeLessThanOrEqual(doorLeft);
    expect(b02.x).toBeGreaterThanOrEqual(doorRight);
    expect(b01.width).toBeGreaterThan(300);
    expect(b02.width).toBeGreaterThan(300);

    // Entrance-bar seats: 3 evenly spaced along the bar, on the room side (above it), inside its span.
    for (const bar of [b01, b02]) {
      const seats = layout.seats.filter((s) => s.tableCode === bar.code).sort((a, b) => a.seatNumber - b.seatNumber);
      expect(seats).toHaveLength(3);
      for (const s of seats) {
        expect(s.y).toBeLessThan(bar.y);
        expect(s.x).toBeGreaterThan(bar.x);
        expect(s.x).toBeLessThan(bar.x + bar.width);
      }
      expect(seats[1]!.x - seats[0]!.x).toBeCloseTo(seats[2]!.x - seats[1]!.x, 5);
    }

    // Entrance-bar seats stay clear of the Mesa 1 / Mesa 7 bottom seat rows (seat radius ~25).
    const rowBottom = Math.max(...layout.seats.filter((s) => s.tableCode === "M01").map((s) => s.y));
    for (const s of layout.seats.filter((x) => x.tableCode === "B01" || x.tableCode === "B02")) {
      expect(s.y - rowBottom).toBeGreaterThanOrEqual(60);
    }
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
