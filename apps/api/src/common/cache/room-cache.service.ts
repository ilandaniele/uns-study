import { Injectable } from "@nestjs/common";
import { asc, eq, or } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { ApiErrors } from "../api-error.js";
import { TtlCache } from "./ttl-cache.js";

export type RoomRow = typeof schema.rooms.$inferSelect;
export type TableRow = typeof schema.roomTables.$inferSelect;
export type SeatRow = typeof schema.seats.$inferSelect;

export interface RoomLayout {
  roomId: string;
  tables: TableRow[];
  /** Every seat of the room (active or not), ordered by code. */
  seats: SeatRow[];
  activeSeats: SeatRow[];
  seatById: Map<string, SeatRow>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Safety net only: every writer calls `invalidate`, the TTL just bounds staleness from out-of-band changes (seed script, manual SQL). */
const ROOM_TTL_MS = 5 * 60_000;

/**
 * Process-local cache of the room data that practically never changes: the room row (geofence,
 * timezone, ...) and its tables/seats. Writers MUST call `invalidate(roomId)` (admin geofence
 * update, table nickname change, seed) — the API runs as a single instance, so that is enough.
 */
@Injectable()
export class RoomCache {
  private readonly rooms = new TtlCache<string, RoomRow | undefined>(ROOM_TTL_MS);
  private readonly layouts = new TtlCache<string, RoomLayout>(ROOM_TTL_MS);

  /** Room row by id or slug; throws `ROOM_NOT_FOUND` (never cached). */
  async getRoom(db: Db, idOrSlug: string): Promise<RoomRow> {
    const room = await this.findRoom(db, idOrSlug);
    if (!room) throw ApiErrors.roomNotFound();
    return room;
  }

  /** Like `getRoom` but resolves `undefined` when the room does not exist. */
  async findRoom(db: Db, idOrSlug: string): Promise<RoomRow | undefined> {
    return this.rooms.wrap(idOrSlug, async () => {
      const condition = UUID_RE.test(idOrSlug)
        ? or(eq(schema.rooms.id, idOrSlug), eq(schema.rooms.slug, idOrSlug))
        : eq(schema.rooms.slug, idOrSlug);
      const [room] = await db.select().from(schema.rooms).where(condition).limit(1);
      return room;
    });
  }

  /** Tables + seats of a room (one cached load, two queries in parallel). */
  getLayout(db: Db, roomId: string): Promise<RoomLayout> {
    return this.layouts.wrap(roomId, async () => {
      const [tables, seats] = await Promise.all([
        db.select().from(schema.roomTables).where(eq(schema.roomTables.roomId, roomId)),
        db.select().from(schema.seats).where(eq(schema.seats.roomId, roomId)).orderBy(asc(schema.seats.code)),
      ]);
      return {
        roomId,
        tables,
        seats,
        activeSeats: seats.filter((s) => s.active),
        seatById: new Map(seats.map((s) => [s.id, s])),
      };
    });
  }

  /** The room's ACTIVE seat with this id, if any. */
  async getActiveSeat(db: Db, roomId: string, seatId: string): Promise<SeatRow | undefined> {
    const seat = (await this.getLayout(db, roomId)).seatById.get(seatId);
    return seat?.active ? seat : undefined;
  }

  /** Drops everything cached for one room (or all rooms when omitted). */
  invalidate(roomId?: string): void {
    if (!roomId) {
      this.rooms.clear();
      this.layouts.clear();
      return;
    }
    this.rooms.deleteWhere((r) => r?.id === roomId);
    this.layouts.delete(roomId);
  }
}
