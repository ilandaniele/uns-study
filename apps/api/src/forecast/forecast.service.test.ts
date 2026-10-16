import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { FixedClock } from "../platform/clock.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { ForecastService } from "./forecast.service.js";

// 2026-10-14 (Wednesday) 12:00 ART.
const NOW = new Date("2026-10-14T12:00:00-03:00");

describe("ForecastService", () => {
  let db: Db;
  let service: ForecastService;
  let roomId: string;
  let seatId: string;

  async function addCheckIn(startIso: string, endIso: string) {
    await db.insert(schema.checkIns).values({
      userId: "u1",
      roomId,
      seatId,
      status: "EXPIRED",
      startedAt: new Date(startIso),
      expiresAt: new Date(endIso),
      endedAt: new Date(endIso),
    });
  }

  beforeEach(async () => {
    db = freshDb();
    service = new ForecastService(db, new RoomsService(db, new RoomStateService(db)), new FixedClock(NOW));
    roomId = (await getRoom(db)).id;
    seatId = (await getSeats(db))[0]!.id;
    await insertUsers(db, ["u1"]);
  });

  it("get with no row returns defaults", async () => {
    const dto = await service.get(roomId);
    expect(dto).toMatchObject({ roomId, computedAt: null, startHour: 7, endHour: 23, sampleDays: 0 });
    expect(dto.grid).toHaveLength(7);
    expect(dto.grid.every((row) => row.length === 17 && row.every((v) => v === null))).toBe(true);
  });

  it("recompute writes a row, get reads it, and the second recompute is a no-op", async () => {
    // Monday 2026-10-12 09:00-10:00 ART: 54 of 108 seats' worth, one of four sampled Mondays.
    for (let i = 0; i < 54; i++) await addCheckIn("2026-10-12T09:00:00-03:00", "2026-10-12T10:00:00-03:00");
    expect(await service.recomputeRoom(roomId, NOW)).toBe(true);
    expect(await db.select().from(schema.roomOccupancyForecast)).toHaveLength(1);

    const dto = await service.get(roomId);
    expect(dto.computedAt).toBe(NOW.toISOString());
    expect(dto.sampleDays).toBe(28);
    expect(dto.grid[0]![2]).toBe(0.13); // 0.5 averaged over 4 Mondays = 0.125
  });

  it("skips the write when nothing changed", async () => {
    await addCheckIn("2026-10-12T09:00:00-03:00", "2026-10-12T10:00:00-03:00");
    await service.recomputeRoom(roomId, NOW);
    const [before] = await db.select().from(schema.roomOccupancyForecast);
    expect(await service.recomputeRoom(roomId, new Date(NOW.getTime() + 3_600_000))).toBe(false);
    const [after] = await db.select().from(schema.roomOccupancyForecast);
    expect(after).toEqual(before);
  });

  it("excludes the current day", async () => {
    await addCheckIn("2026-10-14T09:00:00-03:00", "2026-10-14T11:00:00-03:00");
    await service.recomputeRoom(roomId, NOW);
    const dto = await service.get(roomId);
    expect(dto.grid[2]!.every((v) => v === 0)).toBe(true); // Wednesday: samples exist, none count
  });

  it("returns false without throwing when the table is missing", async () => {
    db.run(sql`DROP TABLE room_occupancy_forecast`);
    expect(await service.recomputeRoom(roomId, NOW)).toBe(false);
    expect((await service.get(roomId)).computedAt).toBeNull();
  });
});
