import { describe, expect, it } from "vitest";
import { buildForecastGrid } from "./forecast-grid.js";

const TZ = "America/Argentina/Buenos_Aires";
// ART = UTC-3. 2026-10-12 is a Monday, 2026-10-19 the next Monday.
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-03:00`);

describe("buildForecastGrid", () => {
  it("measures a single check-in's overlap per hour", () => {
    const grid = buildForecastGrid([{ startedAt: at("2026-10-12", "09:30"), endAt: at("2026-10-12", "11:00") }], 2, ["2026-10-12"], TZ);
    expect(grid.sampleDays).toBe(1);
    const mon = grid.grid[0]!;
    expect(mon[9 - 7]).toBe(0.25); // 30 min of 1 seat / 2 seats
    expect(mon[10 - 7]).toBe(0.5);
    expect(mon[11 - 7]).toBe(0);
    expect(mon[8 - 7]).toBe(0);
  });

  it("adds up concurrent check-ins", () => {
    const grid = buildForecastGrid(
      [
        { startedAt: at("2026-10-12", "10:00"), endAt: at("2026-10-12", "11:00") },
        { startedAt: at("2026-10-12", "10:00"), endAt: at("2026-10-12", "10:30") },
      ],
      4,
      ["2026-10-12"],
      TZ,
    );
    expect(grid.grid[0]![3]).toBe(0.38); // 1.5 / 4 = 0.375
  });

  it("clamps to 1 and handles a room without seats", () => {
    const c = [{ startedAt: at("2026-10-12", "10:00"), endAt: at("2026-10-12", "11:00") }];
    expect(buildForecastGrid(c, 0, ["2026-10-12"], TZ).grid[0]![3]).toBe(0);
    const many = Array.from({ length: 5 }, () => c[0]!);
    expect(buildForecastGrid(many, 2, ["2026-10-12"], TZ).grid[0]![3]).toBe(1);
  });

  it("averages the sample days of a weekday and leaves other weekdays null", () => {
    const grid = buildForecastGrid(
      [{ startedAt: at("2026-10-12", "10:00"), endAt: at("2026-10-12", "11:00") }],
      1,
      ["2026-10-12", "2026-10-19"],
      TZ,
    );
    expect(grid.sampleDays).toBe(2);
    expect(grid.grid[0]![3]).toBe(0.5);
    expect(grid.grid[1]!.every((v) => v === null)).toBe(true);
    expect(grid.grid[0]).toHaveLength(17);
  });

  it("ignores check-ins outside the sampled days and the 07-23 window", () => {
    const grid = buildForecastGrid(
      [
        { startedAt: at("2026-10-13", "10:00"), endAt: at("2026-10-13", "11:00") },
        { startedAt: at("2026-10-12", "02:00"), endAt: at("2026-10-12", "06:00") },
      ],
      1,
      ["2026-10-12"],
      TZ,
    );
    expect(grid.grid[0]!.every((v) => v === 0)).toBe(true);
  });
});
