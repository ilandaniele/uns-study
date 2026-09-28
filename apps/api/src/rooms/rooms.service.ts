import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, or } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { RoomDto, RoomMapDto, SeatDto, TableDto } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { RoomStateService } from "./room-state.service.js";
import { ApiErrors } from "../common/api-error.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class RoomsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
  ) {}

  async listRooms(): Promise<RoomDto[]> {
    const rows = await this.db.select().from(schema.rooms).where(eq(schema.rooms.active, true)).orderBy(asc(schema.rooms.slug));
    return rows.map(toRoomDto);
  }

  async findRoomRow(idOrSlug: string) {
    const condition = UUID_RE.test(idOrSlug)
      ? or(eq(schema.rooms.id, idOrSlug), eq(schema.rooms.slug, idOrSlug))
      : eq(schema.rooms.slug, idOrSlug);
    const [room] = await this.db.select().from(schema.rooms).where(condition).limit(1);
    if (!room) throw ApiErrors.roomNotFound();
    return room;
  }

  async getRoom(idOrSlug: string): Promise<RoomDto> {
    return toRoomDto(await this.findRoomRow(idOrSlug));
  }

  async getRoomMap(idOrSlug: string): Promise<RoomMapDto> {
    const room = await this.findRoomRow(idOrSlug);
    const now = new Date();

    const tableRows = await this.db.select().from(schema.roomTables).where(eq(schema.roomTables.roomId, room.id));
    const seatRows = await this.db
      .select()
      .from(schema.seats)
      .where(eq(schema.seats.roomId, room.id))
      .orderBy(asc(schema.seats.code));

    const liveStates = await this.roomState.getLiveSeatStates(room.id, now);

    const tables: TableDto[] = tableRows.map((t) => ({
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

    const seats: SeatDto[] = seatRows
      .filter((s) => s.active)
      .map((s) => {
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
        };
      });

    const summary = { roomId: room.id, total: seats.length, free: 0, occupied: 0, uncertain: 0, unknown: 0 };
    for (const seat of seats) {
      if (seat.status === "FREE") summary.free++;
      else if (seat.status === "OCCUPIED") summary.occupied++;
      else if (seat.status === "UNCERTAIN") summary.uncertain++;
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
