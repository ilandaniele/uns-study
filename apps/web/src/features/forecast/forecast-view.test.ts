import { describe, expect, it } from "vitest";
import type { RoomForecastDto } from "@sala/contracts";
import { artNow, headline, todaySlots } from "./forecast-view";

function dto(row: (number | null)[] | null = null): RoomForecastDto {
  const grid: (number | null)[][] = Array.from({ length: 7 }, () => Array.from({ length: 17 }, () => null));
  if (row) grid[2] = row; // Wednesday
  return { roomId: "r", computedAt: "2026-10-14T07:00:00.000Z", startHour: 7, endHour: 23, sampleDays: 28, grid };
}
const row = Array.from({ length: 17 }, (_, i) => (i + 7) / 100); // hour h -> h %
const wed = (hour: number, minute: number) => ({ weekday: 2, hour, minute });

describe("artNow", () => {
  it("reads weekday and time in Argentina", () => {
    // 2026-10-14 is a Wednesday; 18:10Z = 15:10 ART.
    expect(artNow(new Date("2026-10-14T18:10:00Z"))).toEqual({ weekday: 2, hour: 15, minute: 10 });
    expect(artNow(new Date("2026-10-15T01:30:00Z"))).toEqual({ weekday: 2, hour: 22, minute: 30 });
  });
});

describe("todaySlots", () => {
  it("returns 17 slots for the current weekday", () => {
    const slots = todaySlots(dto(row), wed(10, 0));
    expect(slots).toHaveLength(17);
    expect(slots[0]).toEqual({ hour: 7, ratio: 0.07 });
    expect(slots[16]).toEqual({ hour: 23, ratio: 0.23 });
  });
  it("is all null for a weekday without sample", () => {
    expect(todaySlots(dto(row), { weekday: 5, hour: 10, minute: 0 }).every((s) => s.ratio === null)).toBe(true);
  });
});

describe("headline", () => {
  it("clamps 06:30 to the first slot", () => {
    expect(headline(dto(row), wed(6, 30))).toBe("Hoy a las 7 h suele estar al 7 %");
  });
  it("uses the next full hour at 15:10", () => {
    expect(headline(dto(row), wed(15, 10))).toBe("Hoy a las 16 h suele estar al 16 %");
  });
  it("is null after the last slot (23:30)", () => {
    expect(headline(dto(row), wed(23, 30))).toBeNull();
  });
  it("is null with no data or no computation", () => {
    expect(headline(dto(), wed(15, 10))).toBeNull();
    expect(headline({ ...dto(row), computedAt: null }, wed(15, 10))).toBeNull();
  });
});
