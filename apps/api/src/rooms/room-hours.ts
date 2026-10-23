import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { fromZonedTime } from "date-fns-tz";
import { localDateOf, nextLocalMidnight } from "../common/dates.js";
import { ApiErrors } from "../common/api-error.js";
import { HOLIDAYS_2026 } from "./holidays-2026.js";

/** Owner-confirmed hours for principal: 08–24, weekends/national holidays 08–22. */
export function operatingWindow(now: Date, timezone: string) {
  const day = localDateOf(now, timezone);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const holiday = HOLIDAYS_2026.has(day);
  const earlyClose = weekday === 0 || weekday === 6 || holiday;
  const opensAt = fromZonedTime(`${day}T08:00:00`, timezone);
  const closesAt = earlyClose ? fromZonedTime(`${day}T22:00:00`, timezone) : nextLocalMidnight(day, timezone);
  return { opensAt, closesAt, open: now >= opensAt && now < closesAt, holiday };
}

export class RoomHours {
  constructor(private readonly db: Db) {}

  window(roomId: string, now = new Date()) {
    const room = this.db.select({ slug: schema.rooms.slug, timezone: schema.rooms.timezone })
      .from(schema.rooms).where(eq(schema.rooms.id, roomId)).get();
    return room?.slug === "principal" ? operatingWindow(now, room.timezone) : null;
  }

  assertOpen(roomId: string, now = new Date()): void {
    if (this.window(roomId, now)?.open === false) throw ApiErrors.validation("La sala está cerrada. Abre todos los días a las 08:00.");
  }

  expiry(roomId: string, now: Date, requested: Date): Date {
    this.assertOpen(roomId, now);
    const closesAt = this.window(roomId, now)?.closesAt;
    return closesAt && closesAt < requested ? closesAt : requested;
  }
}
