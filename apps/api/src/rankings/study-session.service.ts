import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { schema, type Db } from "@sala/database";
import { DB } from "../database/database.module.js";

const MAX_VERIFIED_MINUTES = 240;
const MIN_VERIFIED_MINUTES = 5;
const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

export interface CheckInForSession {
  id: string;
  userId: string;
  roomId: string;
  startedAt: Date | string;
  expiresAt: Date | string;
}

/**
 * Records a completed `study_sessions` row whenever a check-in leaves ACTIVE (checkout, move to
 * another seat, expiration sweep, or daily reset). Idempotent per check-in via the
 * `study_sessions.check_in_id` unique constraint, so it is safe to call more than once.
 */
@Injectable()
export class StudySessionService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async recordFromCheckIn(tx: Db, checkIn: CheckInForSession, endedAt: Date): Promise<void> {
    const startedAt = new Date(checkIn.startedAt);
    const expiresAt = new Date(checkIn.expiresAt);
    // A check-in can only ever be "verified" up to its own expiry, even if it's swept up late.
    const effectiveEnd = endedAt.getTime() < expiresAt.getTime() ? endedAt : expiresAt;

    const minutes = Math.floor((effectiveEnd.getTime() - startedAt.getTime()) / 60_000);
    if (minutes < MIN_VERIFIED_MINUTES) return;
    const verifiedMinutes = Math.min(minutes, MAX_VERIFIED_MINUTES);

    const [room] = await tx.select({ timezone: schema.rooms.timezone }).from(schema.rooms).where(eq(schema.rooms.id, checkIn.roomId)).limit(1);
    const timezone = room?.timezone ?? DEFAULT_TIMEZONE;
    const localDate = format(toZonedTime(startedAt, timezone), "yyyy-MM-dd");

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
}
