import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { chunk, schema, type Db } from "@sala/database";
import { SEAT_WATCH_MAX_SEATS, SEAT_WATCH_TTL_MINUTES, type SeatWatchDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { isMissingSchemaError, orDefault } from "../common/sqlite-errors.js";
import type { Clock } from "../platform/clock.js";
import type { RoomsService } from "../rooms/rooms.service.js";

/** A PUT that finds the same seats with more than this much time left changes nothing (saves a write). */
const REFRESH_AFTER_MIN = SEAT_WATCH_TTL_MINUTES - 10;

type WatchRow = typeof schema.seatWatches.$inferSelect;

function parseSeatIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function toDto(row: WatchRow): SeatWatchDto {
  return { roomId: row.roomId, seatIds: parseSeatIds(row.seatIds), expiresAt: row.expiresAt.toISOString() };
}

/** Pro seat watches: "tell me when one of these seats frees up". Never touches seat state. */
export class SeatWatchService {
  constructor(
    private readonly db: Db,
    private readonly rooms: RoomsService,
    private readonly clock: Clock,
  ) {}

  async get(userId: string, roomIdOrSlug: string): Promise<SeatWatchDto | null> {
    const room = await this.rooms.findRoomRow(roomIdOrSlug);
    const now = this.clock.now();
    const row = await orDefault(
      () => this.db.select().from(schema.seatWatches).where(eq(schema.seatWatches.userId, userId)).limit(1).get(),
      undefined,
    );
    if (!row || row.roomId !== room.id || row.expiresAt.getTime() <= now.getTime()) return null;
    return toDto(row);
  }

  /** Validates the seats belong to the room; replaces any watch (any room). */
  async put(userId: string, roomIdOrSlug: string, seatIds: string[]): Promise<SeatWatchDto> {
    const room = await this.rooms.findRoomRow(roomIdOrSlug);
    const unique = [...new Set(seatIds)].sort();
    if (unique.length === 0 || unique.length > SEAT_WATCH_MAX_SEATS) throw ApiErrors.validation(`Elegí entre 1 y ${SEAT_WATCH_MAX_SEATS} lugares.`);

    const valid = await this.db
      .select({ id: schema.seats.id })
      .from(schema.seats)
      .where(and(eq(schema.seats.roomId, room.id), eq(schema.seats.active, true), inArray(schema.seats.id, unique)));
    if (valid.length !== unique.length) throw ApiErrors.validation("Algún lugar no pertenece a esta sala.");

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + SEAT_WATCH_TTL_MINUTES * 60_000);
    try {
      return this.db.transaction((tx) => {
        const existing = tx.select().from(schema.seatWatches).where(eq(schema.seatWatches.userId, userId)).limit(1).get();
        if (
          existing &&
          existing.roomId === room.id &&
          existing.expiresAt.getTime() - now.getTime() > REFRESH_AFTER_MIN * 60_000 &&
          [...parseSeatIds(existing.seatIds)].sort().join(",") === unique.join(",")
        ) {
          return toDto(existing);
        }
        const row = tx
          .insert(schema.seatWatches)
          .values({ userId, roomId: room.id, seatIds: JSON.stringify(unique), expiresAt, createdAt: now })
          .onConflictDoUpdate({
            target: schema.seatWatches.userId,
            set: { roomId: room.id, seatIds: JSON.stringify(unique), expiresAt, createdAt: now },
          })
          .returning()
          .get();
        return toDto(row);
      });
    } catch (err) {
      if (isMissingSchemaError(err)) throw ApiErrors.featureDisabled();
      throw err;
    }
  }

  async remove(userId: string): Promise<void> {
    try {
      this.db.transaction((tx) => {
        const existing = tx.select({ userId: schema.seatWatches.userId }).from(schema.seatWatches).where(eq(schema.seatWatches.userId, userId)).limit(1).get();
        if (!existing) return;
        tx.delete(schema.seatWatches).where(eq(schema.seatWatches.userId, userId)).run();
      });
    } catch (err) {
      if (isMissingSchemaError(err)) return;
      throw err;
    }
  }

  /** Matched watches for freed seats in roomId (not expired). Deletes them in the same transaction. Missing table -> []. */
  async claimMatches(roomId: string, freedSeatIds: readonly string[], now: Date): Promise<{ userId: string; seatId: string }[]> {
    if (freedSeatIds.length === 0) return [];
    const freed = new Set(freedSeatIds);
    return orDefault(
      () =>
        this.db.transaction((tx) => {
          const watches = tx
            .select()
            .from(schema.seatWatches)
            .where(and(eq(schema.seatWatches.roomId, roomId), gt(schema.seatWatches.expiresAt, now)))
            .all();
          const matches: { userId: string; seatId: string }[] = [];
          for (const watch of watches) {
            const seatId = parseSeatIds(watch.seatIds).find((id) => freed.has(id));
            if (seatId) matches.push({ userId: watch.userId, seatId });
          }
          // Chunked: the Durable Object SQLite caps bound parameters per statement.
          for (const part of chunk(matches.map((m) => m.userId), 90)) {
            tx.delete(schema.seatWatches).where(inArray(schema.seatWatches.userId, part)).run();
          }
          return matches;
        }),
      [],
    );
  }

  /** Deletes rows with expires_at <= now. Returns count. Missing table -> 0. */
  async deleteExpired(now: Date): Promise<number> {
    return orDefault(
      () => this.db.delete(schema.seatWatches).where(lte(schema.seatWatches.expiresAt, now)).returning({ userId: schema.seatWatches.userId }).all().length,
      0,
    );
  }
}
