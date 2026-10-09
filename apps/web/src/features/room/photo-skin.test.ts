import { describe, expect, it } from "vitest";
import { photoSkinFor } from "./photo-skin";

function seatCodes(): string[] {
  const codes: string[] = [];
  for (let t = 1; t <= 12; t++) for (let s = 1; s <= 8; s++) codes.push(`M${String(t).padStart(2, "0")}-S0${s}`);
  for (const bar of ["B01", "B02", "B03", "B04"]) for (let s = 1; s <= 3; s++) codes.push(`${bar}-S0${s}`);
  return codes;
}

function mapOf(slug: string, codes: string[]) {
  return { room: { slug } as never, seats: codes.map((code) => ({ code }) as never) };
}

describe("photoSkinFor", () => {
  it("covers all 108 places of the main room", () => {
    const skin = photoSkinFor(mapOf("principal", seatCodes()));
    expect(skin).not.toBeNull();
    expect(skin!.seats.size).toBe(108);
    expect(skin!.tables.size).toBe(12);
  });

  it("keeps every marker inside the photo and no two markers on top of each other", () => {
    const skin = photoSkinFor(mapOf("principal", seatCodes()))!;
    const points = [...skin.seats.values()];
    for (const p of points) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(skin.viewBox.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(skin.viewBox.height);
    }
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++)
        expect(Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y)).toBeGreaterThan(50);
  });

  it("orders main-table seats 1-4 left to right on the back side and 5-8 right to left on the entrance side", () => {
    const skin = photoSkinFor(mapOf("principal", seatCodes()))!;
    const s = (n: number) => skin.seats.get(`M01-S0${n}`)!;
    expect(s(1).x).toBeLessThan(s(4).x);
    expect(s(5).x).toBeGreaterThan(s(8).x);
    expect(s(1).y).toBeLessThan(s(5).y);
    expect(s(1).x).toBe(s(8).x);
  });

  it("falls back to the drawn map for an unknown room or a seat the photo does not have", () => {
    expect(photoSkinFor(mapOf("otra", seatCodes()))).toBeNull();
    expect(photoSkinFor(mapOf("principal", [...seatCodes(), "M13-S01"]))).toBeNull();
  });
});
