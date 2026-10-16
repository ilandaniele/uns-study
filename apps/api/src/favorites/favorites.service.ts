import { and, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { FAVORITE_SEATS_MAX, type FavoriteSeatsDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { isMissingSchemaError, orDefault } from "../common/sqlite-errors.js";
import type { Clock } from "../platform/clock.js";
import type { RoomsService } from "../rooms/rooms.service.js";

/** Pro favorite seats: up to 3 per room, stored server-side. */
export class FavoriteSeatsService {
  constructor(
    private readonly db: Db,
    private readonly rooms: RoomsService,
    private readonly clock: Clock,
  ) {}

  async get(userId: string, roomIdOrSlug: string): Promise<FavoriteSeatsDto> {
    const room = await this.rooms.findRoomRow(roomIdOrSlug);
    const row = await orDefault(() => this.readRow(userId, room.id), undefined);
    return { seatIds: row ? parseSeatIds(row.seatIds) : [] };
  }

  /** Replaces the list; an empty list deletes the row, and an unchanged list writes nothing. */
  async put(userId: string, roomIdOrSlug: string, seatIds: string[]): Promise<FavoriteSeatsDto> {
    const room = await this.rooms.findRoomRow(roomIdOrSlug);
    const unique = [...new Set(seatIds)];
    if (unique.length > FAVORITE_SEATS_MAX) throw ApiErrors.validation(`Podés guardar hasta ${FAVORITE_SEATS_MAX} lugares favoritos.`);

    if (unique.length > 0) {
      const valid = this.db
        .select({ id: schema.seats.id })
        .from(schema.seats)
        .where(and(eq(schema.seats.roomId, room.id), eq(schema.seats.active, true), inArray(schema.seats.id, unique)))
        .all();
      if (valid.length !== unique.length) throw ApiErrors.validation("Algún lugar no pertenece a esta sala.");
    }

    try {
      this.db.transaction((tx) => {
        const current = tx
          .select()
          .from(schema.favoriteSeats)
          .where(and(eq(schema.favoriteSeats.userId, userId), eq(schema.favoriteSeats.roomId, room.id)))
          .get();
        const currentIds = current ? parseSeatIds(current.seatIds) : [];
        if (sameIds(currentIds, unique)) return;
        if (unique.length === 0) {
          tx.delete(schema.favoriteSeats).where(and(eq(schema.favoriteSeats.userId, userId), eq(schema.favoriteSeats.roomId, room.id))).run();
          return;
        }
        const updatedAt = this.clock.now();
        tx.insert(schema.favoriteSeats)
          .values({ userId, roomId: room.id, seatIds: JSON.stringify(unique), updatedAt })
          .onConflictDoUpdate({
            target: [schema.favoriteSeats.userId, schema.favoriteSeats.roomId],
            set: { seatIds: JSON.stringify(unique), updatedAt },
          })
          .run();
      });
    } catch (err) {
      if (isMissingSchemaError(err)) throw ApiErrors.featureDisabled();
      throw err;
    }
    return { seatIds: unique };
  }

  private async readRow(userId: string, roomId: string) {
    return this.db
      .select()
      .from(schema.favoriteSeats)
      .where(and(eq(schema.favoriteSeats.userId, userId), eq(schema.favoriteSeats.roomId, roomId)))
      .get();
  }
}

function parseSeatIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...a].sort();
  const other = [...b].sort();
  return sorted.every((id, i) => id === other[i]);
}
