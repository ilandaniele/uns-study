import { createHmac } from "node:crypto";
import { fromZonedTime } from "date-fns-tz";
import { and, count, eq, gte } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { RoomTodayStatsDto } from "@sala/contracts";
import { localDateOf } from "../common/dates.js";
import { env } from "../env.js";
import { RoomsService } from "./rooms.service.js";

/**
 * Salted, one-way id for a visitor: HMAC-sha256 of `u:<userId>` or `ip:<ip>` keyed with the server
 * secret. The raw user id / IP is never stored, and the hash can't be reversed without the secret.
 */
export function visitorHashOf(secret: string, visitor: { userId: string | null; ip: string }): string {
  const key = visitor.userId ? `u:${visitor.userId}` : `ip:${visitor.ip}`;
  return createHmac("sha256", secret).update(key).digest("hex");
}

/** Social-proof counters: distinct room visitors per local day and the caller's own contributions. */
export class RoomStatsService {
  constructor(
    private readonly db: Db,
    private readonly rooms: RoomsService,
    private readonly secret: string = env.betterAuthSecret,
  ) {}

  /** Idempotent: the same visitor counts once per room per local day. */
  async recordVisit(idOrSlug: string, visitor: { userId: string | null; ip: string }, now: Date = new Date()): Promise<void> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    await this.db
      .insert(schema.roomDailyVisitors)
      .values({ roomId: room.id, localDate: localDateOf(now, room.timezone), visitorHash: visitorHashOf(this.secret, visitor) })
      .onConflictDoNothing()
      .run();
  }

  async getToday(idOrSlug: string, userId: string | null, now: Date = new Date()): Promise<RoomTodayStatsDto> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    const localDate = localDateOf(now, room.timezone);

    const visitors = this.db
      .select({ n: count() })
      .from(schema.roomDailyVisitors)
      .where(and(eq(schema.roomDailyVisitors.roomId, room.id), eq(schema.roomDailyVisitors.localDate, localDate)))
      .get();

    let myContributionsToday: number | null = null;
    if (userId) {
      const dayStart = fromZonedTime(`${localDate}T00:00:00`, room.timezone);
      const mine = this.db
        .select({ n: count() })
        .from(schema.seatObservations)
        .where(
          and(
            eq(schema.seatObservations.userId, userId),
            eq(schema.seatObservations.roomId, room.id),
            eq(schema.seatObservations.adminOverride, false),
            gte(schema.seatObservations.createdAt, dayStart),
          ),
        )
        .get();
      myContributionsToday = mine?.n ?? 0;
    }

    return { visitorsToday: visitors?.n ?? 0, myContributionsToday };
  }
}
