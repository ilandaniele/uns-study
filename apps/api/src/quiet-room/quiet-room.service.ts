import { and, eq, gt, gte, inArray, lt, lte } from "drizzle-orm";
import { chunk, schema, type Db } from "@sala/database";
import { QUIET_ROOM_MIN_SEATS, QUIET_ROOM_TTL_MINUTES, type QuietRoomThreshold, type QuietWatchDto, type RoomSummary } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { isMissingSchemaError, orDefault } from "../common/sqlite-errors.js";
import type { Clock } from "../platform/clock.js";
import type { RoomsService } from "../rooms/rooms.service.js";
import type { SeatStateChange } from "../rooms/room-state.service.js";

/** A PUT that finds the same room+threshold with more than this much time left changes nothing (saves a write). */
const REFRESH_AFTER_MIN = QUIET_ROOM_TTL_MINUTES - 10;

type WatchRow = typeof schema.quietRoomWatches.$inferSelect;

function toDto(row: WatchRow): QuietWatchDto {
  return { roomId: row.roomId, thresholdPct: row.thresholdPct as QuietRoomThreshold, expiresAt: row.expiresAt.toISOString() };
}

function occupiedish(status: string | null | undefined): boolean {
  return status === "OCCUPIED" || status === "SAVED" || status === "UNCERTAIN";
}

/** Occupancy % before and after one coalesced flush; null when total < QUIET_ROOM_MIN_SEATS.
 *  before = after - sum(delta), delta = +1 if status occupied-ish and previousStatus not, -1 if the reverse;
 *  changes with previousStatus === undefined contribute 0; occupied-ish = OCCUPIED|SAVED|UNCERTAIN. */
export function occupancyCrossing(summary: RoomSummary, changes: readonly SeatStateChange[]): { beforePct: number; afterPct: number } | null {
  if (summary.total < QUIET_ROOM_MIN_SEATS) return null;
  // A seat that changed several times within one flush counts once, from its first previous status to its last status.
  const first = new Map<string, string | null | undefined>();
  const last = new Map<string, string>();
  for (const c of changes) {
    if (!first.has(c.seatId)) first.set(c.seatId, c.previousStatus);
    last.set(c.seatId, c.status);
  }
  let delta = 0;
  for (const [seatId, previous] of first) {
    if (previous === undefined) continue;
    const was = occupiedish(previous);
    const is = occupiedish(last.get(seatId));
    if (is && !was) delta += 1;
    else if (!is && was) delta -= 1;
  }
  const afterCount = summary.occupied + summary.saved + summary.uncertain;
  const pct = (count: number) => Math.round((Math.max(0, count) / summary.total) * 100);
  return { beforePct: pct(afterCount - delta), afterPct: pct(afterCount) };
}

/** Pro quiet-room alert: one watch per user, one-shot, fired when the room drops through the threshold. */
export class QuietRoomService {
  constructor(
    private readonly db: Db,
    private readonly rooms: RoomsService,
    private readonly clock: Clock,
  ) {}

  /** Other room / expired -> null; missing table -> null. */
  async get(userId: string, roomIdOrSlug: string): Promise<QuietWatchDto | null> {
    const room = await this.rooms.findRoomRow(roomIdOrSlug);
    const now = this.clock.now();
    const row = await orDefault(
      () => this.db.select().from(schema.quietRoomWatches).where(eq(schema.quietRoomWatches.userId, userId)).limit(1).get(),
      undefined,
    );
    if (!row || row.roomId !== room.id || row.expiresAt.getTime() <= now.getTime()) return null;
    return toDto(row);
  }

  /** Skip the write if same room+threshold and > TTL-10 min left; missing table -> featureDisabled. */
  async put(userId: string, roomIdOrSlug: string, thresholdPct: QuietRoomThreshold): Promise<QuietWatchDto> {
    const room = await this.rooms.findRoomRow(roomIdOrSlug);
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + QUIET_ROOM_TTL_MINUTES * 60_000);
    try {
      return this.db.transaction((tx) => {
        const existing = tx.select().from(schema.quietRoomWatches).where(eq(schema.quietRoomWatches.userId, userId)).limit(1).get();
        if (
          existing &&
          existing.roomId === room.id &&
          existing.thresholdPct === thresholdPct &&
          existing.expiresAt.getTime() - now.getTime() > REFRESH_AFTER_MIN * 60_000
        ) {
          return toDto(existing);
        }
        const row = tx
          .insert(schema.quietRoomWatches)
          .values({ userId, roomId: room.id, thresholdPct, expiresAt, createdAt: now })
          .onConflictDoUpdate({
            target: schema.quietRoomWatches.userId,
            set: { roomId: room.id, thresholdPct, expiresAt, createdAt: now },
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

  /** Read-before-delete; missing table -> no-op. */
  async remove(userId: string): Promise<void> {
    try {
      this.db.transaction((tx) => {
        const existing = tx
          .select({ userId: schema.quietRoomWatches.userId })
          .from(schema.quietRoomWatches)
          .where(eq(schema.quietRoomWatches.userId, userId))
          .limit(1)
          .get();
        if (!existing) return;
        tx.delete(schema.quietRoomWatches).where(eq(schema.quietRoomWatches.userId, userId)).run();
      });
    } catch (err) {
      if (isMissingSchemaError(err)) return;
      throw err;
    }
  }

  /** In one transaction: select watches in roomId with expires_at > now AND threshold_pct >= afterPct AND threshold_pct < beforePct,
   *  delete them (chunk 90). Missing table -> []. */
  async claimCrossed(roomId: string, beforePct: number, afterPct: number, now: Date): Promise<{ userId: string; thresholdPct: number }[]> {
    if (afterPct >= beforePct) return [];
    return orDefault(
      () =>
        this.db.transaction((tx) => {
          const watches = tx
            .select({ userId: schema.quietRoomWatches.userId, thresholdPct: schema.quietRoomWatches.thresholdPct })
            .from(schema.quietRoomWatches)
            .where(
              and(
                eq(schema.quietRoomWatches.roomId, roomId),
                gt(schema.quietRoomWatches.expiresAt, now),
                gte(schema.quietRoomWatches.thresholdPct, afterPct),
                lt(schema.quietRoomWatches.thresholdPct, beforePct),
              ),
            )
            .all();
          // Chunked: the Durable Object SQLite caps bound parameters per statement.
          for (const part of chunk(watches.map((w) => w.userId), 90)) {
            tx.delete(schema.quietRoomWatches).where(inArray(schema.quietRoomWatches.userId, part)).run();
          }
          return watches;
        }),
      [],
    );
  }

  /** Missing table -> 0. */
  async deleteExpired(now: Date): Promise<number> {
    return orDefault(
      () =>
        this.db
          .delete(schema.quietRoomWatches)
          .where(lte(schema.quietRoomWatches.expiresAt, now))
          .returning({ userId: schema.quietRoomWatches.userId })
          .all().length,
      0,
    );
  }
}
