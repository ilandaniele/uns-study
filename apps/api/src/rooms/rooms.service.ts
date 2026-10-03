import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { RoomDto, RoomMapDto, SeatDto, TableDto } from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { RoomStateService } from "./room-state.service.js";
import { RoomCache } from "../common/cache/room-cache.service.js";

@Injectable()
export class RoomsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
    @Inject(RoomCache) private readonly roomCache: RoomCache = new RoomCache(),
  ) {}

  async listRooms(): Promise<RoomDto[]> {
    const rows = await this.db.select().from(schema.rooms).where(eq(schema.rooms.active, true)).orderBy(asc(schema.rooms.slug));
    return rows.map(toRoomDto);
  }

  /** Cached room row by id or slug (see `RoomCache` — writers must invalidate). */
  async findRoomRow(idOrSlug: string) {
    return this.roomCache.getRoom(this.db, idOrSlug);
  }

  async getRoom(idOrSlug: string): Promise<RoomDto> {
    return toRoomDto(await this.findRoomRow(idOrSlug));
  }

  async getRoomMap(idOrSlug: string): Promise<RoomMapDto> {
    const room = await this.findRoomRow(idOrSlug);
    const now = new Date();

    // Tables/seats come from the cache; only the volatile state is read from the database.
    const layout = await this.roomCache.getLayout(this.db, room.id);
    const liveStates = await this.roomState.getLiveSeatStates(room.id, now, layout.activeSeats);

    const tables: TableDto[] = layout.tables.map((t) => ({
      id: t.id,
      code: t.code,
      label: t.label,
      type: t.type,
      x: t.x,
      y: t.y,
      width: t.width,
      height: t.height,
      rotation: t.rotation,
      nickname: t.nickname,
    }));

    const seats: SeatDto[] = layout.activeSeats.map((s) => {
      const live = liveStates.get(s.id);
        return {
          id: s.id,
          tableId: s.tableId,
          code: s.code,
          seatNumber: s.seatNumber,
          x: s.x,
          y: s.y,
          rotation: s.rotation,
          status: live?.status ?? "UNKNOWN",
          confidence: live?.confidence ?? 0,
          lastUpdatedAt: live ? live.lastUpdatedAt.toISOString() : null,
          sourceSummary: live?.sourceSummary ?? null,
          dispute: live?.dispute ? { id: live.dispute.id, closesAt: live.dispute.closesAt.toISOString() } : null,
          verified: live?.verified ?? false,
          occupiedUntil: live?.occupiedUntil ? live.occupiedUntil.toISOString() : null,
        };
      });

    const summary = { roomId: room.id, total: seats.length, free: 0, occupied: 0, uncertain: 0, saved: 0, unknown: 0 };
    for (const seat of seats) {
      if (seat.status === "FREE") summary.free++;
      else if (seat.status === "OCCUPIED") summary.occupied++;
      else if (seat.status === "UNCERTAIN") summary.uncertain++;
      else if (seat.status === "SAVED") summary.saved++;
      else summary.unknown++;
    }

    return {
      room: toRoomDto(room),
      summary,
      tables,
      seats,
      viewBox: { width: 1000, height: 1600 },
    };
  }
}

function toRoomDto(row: typeof schema.rooms.$inferSelect): RoomDto {
  return { id: row.id, slug: row.slug, name: row.name, description: row.description, timezone: row.timezone };
}
