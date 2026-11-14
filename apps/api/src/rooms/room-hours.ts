import { and, asc, eq, isNull, or } from "drizzle-orm";
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
    if (room?.slug !== "principal") return null;
    const regular = operatingWindow(now, room.timezone);
    const closures = this.db.select().from(schema.announcements).where(and(
      eq(schema.announcements.active, true), eq(schema.announcements.closesRoom, true),
      or(isNull(schema.announcements.roomId), eq(schema.announcements.roomId, roomId)),
    )).orderBy(asc(schema.announcements.startsAt)).all();
    const current = closures.filter(c => c.startsAt <= now && (!c.endsAt || c.endsAt > now));
    const nextClosure = closures.find(c => c.startsAt > now);
    const closesAt = nextClosure && nextClosure.startsAt < regular.closesAt ? nextClosure.startsAt : regular.closesAt;
    // After a temporary closure, prior presences must not reappear on reopening.
    const previousEnd = closures.reduce((end, c) => c.endsAt && c.endsAt <= now && c.endsAt > end ? c.endsAt : end, regular.opensAt);
    const open = regular.open && current.length === 0;
    const nextOpensAt = open ? null : nextOpening(now, room.timezone, closures);
    const boundary = now < regular.opensAt ? regular.opensAt : now < regular.closesAt ? regular.closesAt
      : fromZonedTime(`${localDateOf(new Date(+now + 24 * 60 * 60_000), room.timezone)}T08:00:00`, room.timezone);
    const changes = [boundary, ...closures.flatMap(c => [c.startsAt, ...(c.endsAt ? [c.endsAt] : [])])].filter(d => d > now);
    const closure = current.at(-1);
    return { ...regular, open, opensAt: previousEnd, closesAt, nextOpensAt,
      nextChangeAt: new Date(Math.min(...changes.map(Number))),
      ...(closure ? { closure: { id: closure.id, title: closure.title, body: closure.body,
        endsAt: current.some(c => !c.endsAt) ? null : new Date(Math.max(...current.map(c => +c.endsAt!))) } } : {}),
    };
  }

  assertOpen(roomId: string, now = new Date()): void {
    const window = this.window(roomId, now);
    if (window?.open === false) throw ApiErrors.validation(window.closure
      ? `La sala está cerrada: ${window.closure.title}.` : "La sala está cerrada. Abre todos los días a las 08:00.");
  }

  expiry(roomId: string, now: Date, requested: Date): Date {
    this.assertOpen(roomId, now);
    const closesAt = this.window(roomId, now)?.closesAt;
    return closesAt && closesAt < requested ? closesAt : requested;
  }
}

/** Skip complete closure intervals and nightly downtime; never invent an indefinite reopening. */
function nextOpening(now: Date, timezone: string, closures: { startsAt: Date; endsAt: Date | null }[]): Date | null {
  let candidate = now;
  for (let i = 0; i <= closures.length * 2 + 2; i++) {
    const hours = operatingWindow(candidate, timezone);
    if (!hours.open) {
      candidate = candidate < hours.opensAt ? hours.opensAt
        : fromZonedTime(`${localDateOf(new Date(+candidate + 24 * 60 * 60_000), timezone)}T08:00:00`, timezone);
    }
    const covering = closures.filter(c => c.startsAt <= candidate && (!c.endsAt || c.endsAt > candidate));
    if (covering.some(c => !c.endsAt)) return null;
    if (!covering.length) return candidate;
    candidate = new Date(Math.max(...covering.map(c => +c.endsAt!)));
  }
  return null;
}
