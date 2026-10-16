import { fromZonedTime } from "date-fns-tz";
import { and, eq, gte, lt } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { FORECAST_END_HOUR, FORECAST_START_HOUR, type ForecastData, type RoomForecastDto } from "@sala/contracts";
import { localDateOf } from "../common/dates.js";
import { isMissingSchemaError, orDefault } from "../common/sqlite-errors.js";
import type { Clock } from "../platform/clock.js";
import type { RoomsService } from "../rooms/rooms.service.js";
import { addDays } from "../study-history/streak.js";
import { buildForecastGrid, emptyForecastGrid, FORECAST_SLOTS, type ForecastCheckIn } from "./forecast-grid.js";

/** The forecast looks at the 28 full local days before today. */
export const FORECAST_LOOKBACK_DAYS = 28;

function parseStored(raw: string): ForecastData | null {
  try {
    const data = JSON.parse(raw) as ForecastData;
    const shaped =
      typeof data.sampleDays === "number" &&
      Array.isArray(data.grid) &&
      data.grid.length === 7 &&
      data.grid.every((row) => Array.isArray(row) && row.length === FORECAST_SLOTS);
    return shaped ? data : null;
  } catch {
    return null;
  }
}

/** Pro occupancy forecast: a weekday x hour grid rebuilt once per room by the daily reset. */
export class ForecastService {
  constructor(
    private readonly db: Db,
    private readonly rooms: RoomsService,
    private readonly clock: Clock,
  ) {}

  /** No row (or no table) -> computedAt null, grid all null. */
  async get(roomIdOrSlug: string): Promise<RoomForecastDto> {
    const room = await this.rooms.findRoomRow(roomIdOrSlug);
    const row = await orDefault(
      () => this.db.select().from(schema.roomOccupancyForecast).where(eq(schema.roomOccupancyForecast.roomId, room.id)).limit(1).all()[0] ?? null,
      null,
    );
    const data = row ? parseStored(row.data) : null;
    return {
      roomId: room.id,
      computedAt: row && data ? new Date(row.computedAt).toISOString() : null,
      startHour: FORECAST_START_HOUR,
      endHour: FORECAST_END_HOUR,
      sampleDays: data?.sampleDays ?? 0,
      grid: data?.grid ?? emptyForecastGrid(),
    };
  }

  /** True if a row was written (false when unchanged or the table is missing). */
  async recomputeRoom(roomId: string, now: Date = this.clock.now()): Promise<boolean> {
    const room = await this.rooms.findRoomRow(roomId);
    const tz = room.timezone;
    const today = localDateOf(now, tz);
    const firstDay = addDays(today, -FORECAST_LOOKBACK_DAYS);
    const rangeStart = fromZonedTime(`${firstDay}T00:00:00`, tz);
    const rangeEnd = fromZonedTime(`${today}T00:00:00`, tz);

    const rows = this.db
      .select({ startedAt: schema.checkIns.startedAt, endedAt: schema.checkIns.endedAt, expiresAt: schema.checkIns.expiresAt, status: schema.checkIns.status })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, roomId), gte(schema.checkIns.startedAt, rangeStart), lt(schema.checkIns.startedAt, rangeEnd)))
      .all();
    const checkIns: ForecastCheckIn[] = rows.map((r) => {
      const end = r.endedAt ?? (r.status === "ACTIVE" ? now : r.expiresAt);
      return { startedAt: new Date(r.startedAt), endAt: new Date(Math.min(new Date(end).getTime(), rangeEnd.getTime())) };
    });
    const seatCount = this.db
      .select({ id: schema.seats.id })
      .from(schema.seats)
      .where(and(eq(schema.seats.roomId, roomId), eq(schema.seats.active, true)))
      .all().length;
    const localDays = Array.from({ length: FORECAST_LOOKBACK_DAYS }, (_, i) => addDays(firstDay, i));
    const serialized = JSON.stringify(buildForecastGrid(checkIns, seatCount, localDays, tz));

    try {
      const [current] = this.db.select({ data: schema.roomOccupancyForecast.data }).from(schema.roomOccupancyForecast).where(eq(schema.roomOccupancyForecast.roomId, roomId)).limit(1).all();
      if (current?.data === serialized) return false;
      this.db
        .insert(schema.roomOccupancyForecast)
        .values({ roomId, data: serialized, computedAt: now })
        .onConflictDoUpdate({ target: schema.roomOccupancyForecast.roomId, set: { data: serialized, computedAt: now } })
        .run();
      return true;
    } catch (err) {
      if (isMissingSchemaError(err)) return false;
      throw err;
    }
  }
}
