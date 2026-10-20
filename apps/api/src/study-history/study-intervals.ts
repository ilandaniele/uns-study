import { and, eq, gte } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { localDateOf } from "../common/dates.js";
import { minutesByLocalDay, verifiedMinutesFor } from "../rankings/study-session.service.js";

export interface StudyInterval {
  startedAt: Date;
  minutes: number;
  roomId: string;
  /** Still-running check-in counted up to `now`. */
  live: boolean;
  /**
   * Admin credit (`MANUAL` session): counts whole on the local day it starts, never split across days
   * or spread over clock time, since a credit can be longer than any real stay.
   */
  manual?: boolean;
}

/**
 * The user's `study_sessions` with `local_date >= sinceLocalDate`, plus their ACTIVE check-in counted
 * live (`verifiedMinutesFor(startedAt, expiresAt, now)`), the same rule as the rankings service: a
 * live check-in that already has a session row is skipped so it can never count twice.
 */
export async function loadStudyIntervals(db: Db, userId: string, sinceLocalDate: string, now: Date): Promise<StudyInterval[]> {
  const sessions = db
    .select({
      checkInId: schema.studySessions.checkInId,
      startedAt: schema.studySessions.startedAt,
      minutes: schema.studySessions.verifiedMinutes,
      roomId: schema.studySessions.roomId,
      source: schema.studySessions.source,
    })
    .from(schema.studySessions)
    .where(and(eq(schema.studySessions.userId, userId), gte(schema.studySessions.localDate, sinceLocalDate)))
    .all();
  const recorded = new Set(sessions.map((s) => s.checkInId).filter((id): id is string => id !== null));

  const out: StudyInterval[] = sessions.map((s) => ({
    startedAt: s.startedAt,
    minutes: s.minutes,
    roomId: s.roomId,
    live: false,
    manual: s.source === "MANUAL",
  }));

  const active = db
    .select({ id: schema.checkIns.id, roomId: schema.checkIns.roomId, startedAt: schema.checkIns.startedAt, expiresAt: schema.checkIns.expiresAt })
    .from(schema.checkIns)
    .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.status, "ACTIVE")))
    .all();
  for (const c of active) {
    if (recorded.has(c.id)) continue;
    const minutes = verifiedMinutesFor(c.startedAt, c.expiresAt, now);
    if (minutes > 0) out.push({ startedAt: c.startedAt, minutes, roomId: c.roomId, live: true });
  }
  return out;
}

/** Minutes per local day (in `tz`); an interval crossing midnight credits each day its own portion. */
export function minutesByDay(intervals: readonly StudyInterval[], tz: string): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const interval of intervals) {
    if (interval.manual) {
      const day = localDateOf(interval.startedAt, tz);
      byDay.set(day, (byDay.get(day) ?? 0) + interval.minutes);
      continue;
    }
    for (const part of minutesByLocalDay(interval.startedAt, interval.minutes, tz)) {
      byDay.set(part.day, (byDay.get(part.day) ?? 0) + part.minutes);
    }
  }
  return byDay;
}

/** Minutes of each interval that overlap `[from, to)`. */
export function minutesBetween(intervals: readonly StudyInterval[], from: Date, to: Date): number {
  let ms = 0;
  for (const interval of intervals) {
    const start = interval.startedAt.getTime();
    if (interval.manual) {
      // An admin credit counts whole when it starts inside the window.
      if (start >= from.getTime() && start < to.getTime()) ms += interval.minutes * 60_000;
      continue;
    }
    const end = start + interval.minutes * 60_000;
    ms += Math.max(0, Math.min(end, to.getTime()) - Math.max(start, from.getTime()));
  }
  return Math.round(ms / 60_000);
}
