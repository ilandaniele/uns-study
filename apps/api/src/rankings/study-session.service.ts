import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { DB } from "../database/database.module.js";
import { DEFAULT_TIMEZONE, localDateOf, nextLocalMidnight } from "../common/dates.js";

// A renewed ("Sigo acá") check-in stays one row for its whole stay, so the per-check-in cap is the
// daily ranking cap (720 in rankings.service.ts), which is what actually bounds abuse.
export const MAX_VERIFIED_MINUTES = 720;
const MIN_VERIFIED_MINUTES = 5;

/** Verified study minutes of a check-in up to `endAt`: clamped to its expiry, 0 below the minimum, capped. */
export function verifiedMinutesFor(startedAt: Date, expiresAt: Date, endAt: Date): number {
  // A check-in can only ever be "verified" up to its own expiry, even if it's swept up late.
  const effectiveEnd = endAt.getTime() < expiresAt.getTime() ? endAt : expiresAt;
  const minutes = Math.floor((effectiveEnd.getTime() - startedAt.getTime()) / 60_000);
  if (minutes < MIN_VERIFIED_MINUTES) return 0;
  return Math.min(minutes, MAX_VERIFIED_MINUTES);
}

/**
 * Splits `minutes` of study counted from `startedAt` across the local calendar days (in `tz`) they
 * fall on, so a 22:00-04:00 stay credits each day its own portion. Each minute belongs to the day its
 * first instant falls on; the parts always sum to `minutes`.
 */
export function minutesByLocalDay(startedAt: Date, minutes: number, tz: string): { day: string; minutes: number }[] {
  const parts: { day: string; minutes: number }[] = [];
  let cursor = startedAt.getTime();
  let remaining = minutes;
  while (remaining > 0) {
    const day = localDateOf(new Date(cursor), tz);
    const untilMidnight = Math.ceil((nextLocalMidnight(day, tz).getTime() - cursor) / 60_000);
    const portion = Math.min(remaining, Math.max(untilMidnight, 1));
    parts.push({ day, minutes: portion });
    remaining -= portion;
    cursor += portion * 60_000;
  }
  return parts;
}

export interface ManualStudySessionInput {
  userId: string;
  roomId: string;
  startedAt: Date;
  minutes: number;
}

export interface CheckInForSession {
  id: string;
  userId: string;
  roomId: string;
  startedAt: Date | string;
  expiresAt: Date | string;
}

/**
 * Records a completed `study_sessions` row whenever a check-in leaves ACTIVE (checkout, move to
 * another seat, expiration sweep, daily reset, or losing a dispute). Idempotent per check-in via the
 * `study_sessions.check_in_id` unique constraint, so it is safe to call more than once.
 */
@Injectable()
export class StudySessionService {
  constructor(@Inject(DB) _db: Db) {}

  async recordFromCheckIn(tx: Db, checkIn: CheckInForSession, endedAt: Date): Promise<void> {
    const startedAt = new Date(checkIn.startedAt);
    const expiresAt = new Date(checkIn.expiresAt);
    const effectiveEnd = endedAt.getTime() < expiresAt.getTime() ? endedAt : expiresAt;
    const verifiedMinutes = verifiedMinutesFor(startedAt, expiresAt, endedAt);
    if (verifiedMinutes === 0) return;

    const [room] = await tx.select({ timezone: schema.rooms.timezone }).from(schema.rooms).where(eq(schema.rooms.id, checkIn.roomId)).limit(1);
    const timezone = room?.timezone ?? DEFAULT_TIMEZONE;
    const localDate = localDateOf(startedAt, timezone);

    await tx
      .insert(schema.studySessions)
      .values({
        userId: checkIn.userId,
        roomId: checkIn.roomId,
        checkInId: checkIn.id,
        startedAt,
        endedAt: effectiveEnd,
        verifiedMinutes,
        localDate,
        source: "CHECK_IN",
      })
      .onConflictDoNothing({ target: schema.studySessions.checkInId });
  }

  /** Inserts an admin-credited (`MANUAL`) session, not tied to any check-in. Returns its id. */
  async recordManual(tx: Db, input: ManualStudySessionInput): Promise<string> {
    const [room] = await tx.select({ timezone: schema.rooms.timezone }).from(schema.rooms).where(eq(schema.rooms.id, input.roomId)).limit(1);
    const timezone = room?.timezone ?? DEFAULT_TIMEZONE;
    const [row] = await tx
      .insert(schema.studySessions)
      .values({
        userId: input.userId,
        roomId: input.roomId,
        checkInId: null,
        startedAt: input.startedAt,
        endedAt: new Date(input.startedAt.getTime() + input.minutes * 60_000),
        verifiedMinutes: input.minutes,
        localDate: localDateOf(input.startedAt, timezone),
        source: "MANUAL",
      })
      .returning({ id: schema.studySessions.id });
    if (!row) throw new Error("Failed to insert manual study session");
    return row.id;
  }
}
