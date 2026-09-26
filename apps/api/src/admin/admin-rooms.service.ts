import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, gte } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { RoomStatsDto } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";

const HOURS_24_MS = 24 * 60 * 60 * 1000;

export interface AdminOccupantDto {
  seatId: string;
  seatCode: string;
  userId: string;
  name: string;
  email: string;
}

@Injectable()
export class AdminRoomsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
  ) {}

  /** Room map plus occupants with real identities (no privacy filtering — admin only). */
  async live(idOrSlug: string) {
    const map = await this.rooms.getRoomMap(idOrSlug);
    const occupantRows = await this.db
      .select({ seatId: schema.checkIns.seatId, seatCode: schema.seats.code, userId: schema.user.id, name: schema.user.name, email: schema.user.email })
      .from(schema.checkIns)
      .innerJoin(schema.seats, eq(schema.seats.id, schema.checkIns.seatId))
      .innerJoin(schema.user, eq(schema.user.id, schema.checkIns.userId))
      .where(and(eq(schema.checkIns.roomId, map.room.id), eq(schema.checkIns.status, "ACTIVE")));

    const occupants: AdminOccupantDto[] = occupantRows.map((r) => ({ seatId: r.seatId, seatCode: r.seatCode, userId: r.userId, name: r.name, email: r.email }));
    return { map, occupants };
  }

  /** Fresh Seat Coverage = share of active seats with valid recent evidence (i.e. not UNKNOWN). */
  async stats(idOrSlug: string): Promise<RoomStatsDto> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    const now = new Date();
    const dayAgo = new Date(now.getTime() - HOURS_24_MS);

    const liveStates = await this.roomState.getLiveSeatStates(room.id, now);
    const total = liveStates.size;
    const withEvidence = [...liveStates.values()].filter((s) => s.status !== "UNKNOWN").length;
    const freshSeatCoverage = total > 0 ? withEvidence / total : 0;

    const [activeCheckIns] = await this.db
      .select({ value: count() })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, room.id), eq(schema.checkIns.status, "ACTIVE")));
    const [observations24h] = await this.db
      .select({ value: count() })
      .from(schema.seatObservations)
      .where(and(eq(schema.seatObservations.roomId, room.id), gte(schema.seatObservations.createdAt, dayAgo)));
    const [checkIns24h] = await this.db
      .select({ value: count() })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, room.id), gte(schema.checkIns.createdAt, dayAgo)));

    return {
      roomId: room.id,
      freshSeatCoverage,
      activeCheckIns: Number(activeCheckIns?.value ?? 0),
      observationsLast24h: Number(observations24h?.value ?? 0),
      checkInsLast24h: Number(checkIns24h?.value ?? 0),
    };
  }
}
