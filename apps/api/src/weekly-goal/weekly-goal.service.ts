import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { WeeklyGoalDto, WeeklyGoalRequest } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { DEFAULT_TIMEZONE, localDateOf, nextLocalMidnight } from "../common/dates.js";
import { isMissingSchemaError, orDefault } from "../common/sqlite-errors.js";
import type { Clock } from "../platform/clock.js";
import { addDays, artWeekBounds } from "../study-history/streak.js";
import { loadStudyIntervals, minutesBetween } from "../study-history/study-intervals.js";

/** The instant the local day `localDate` starts. */
function startOfLocalDay(localDate: string, tz: string): Date {
  return nextLocalMidnight(addDays(localDate, -1), tz);
}

/** Pro weekly study goal and its reminder preference (both live in `study_goals`). */
export class WeeklyGoalService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async get(userId: string): Promise<WeeklyGoalDto> {
    const row = await orDefault(() => this.readRow(userId), undefined);
    return this.toDto(userId, row ?? null, this.clock.now());
  }

  /** `minutes: null` deletes the goal; an unchanged goal writes nothing. */
  async put(userId: string, input: WeeklyGoalRequest): Promise<WeeklyGoalDto> {
    try {
      this.db.transaction((tx) => {
        const current = tx.select().from(schema.studyGoals).where(eq(schema.studyGoals.userId, userId)).get();
        if (input.minutes === null) {
          if (current) tx.delete(schema.studyGoals).where(eq(schema.studyGoals.userId, userId)).run();
          return;
        }
        const reminderEnabled = input.reminderEnabled ?? current?.reminderEnabled ?? true;
        if (current && current.weeklyGoalMinutes === input.minutes && current.reminderEnabled === reminderEnabled) return;
        const updatedAt = this.clock.now();
        tx.insert(schema.studyGoals)
          .values({ userId, weeklyGoalMinutes: input.minutes, reminderEnabled, updatedAt })
          .onConflictDoUpdate({
            target: schema.studyGoals.userId,
            set: { weeklyGoalMinutes: input.minutes, reminderEnabled, updatedAt },
          })
          .run();
      });
    } catch (err) {
      if (isMissingSchemaError(err)) throw ApiErrors.featureDisabled();
      throw err;
    }
    return this.get(userId);
  }

  /** Users with reminder_enabled and a goal, plus their progress this ART week. Missing table -> []. */
  async reminderCandidates(now: Date): Promise<{ userId: string; goalMinutes: number; studiedMinutes: number }[]> {
    const rows = await orDefault(
      () => this.db.select().from(schema.studyGoals).where(eq(schema.studyGoals.reminderEnabled, true)).all(),
      [] as (typeof schema.studyGoals.$inferSelect)[],
    );
    const out: { userId: string; goalMinutes: number; studiedMinutes: number }[] = [];
    for (const row of rows) {
      out.push({ userId: row.userId, goalMinutes: row.weeklyGoalMinutes, studiedMinutes: await this.studiedThisWeek(row.userId, now) });
    }
    return out;
  }

  private async readRow(userId: string) {
    return this.db.select().from(schema.studyGoals).where(eq(schema.studyGoals.userId, userId)).get();
  }

  private async toDto(userId: string, row: typeof schema.studyGoals.$inferSelect | null, now: Date): Promise<WeeklyGoalDto> {
    const { start, end } = artWeekBounds(localDateOf(now, DEFAULT_TIMEZONE));
    return {
      goalMinutes: row?.weeklyGoalMinutes ?? null,
      reminderEnabled: row?.reminderEnabled ?? true,
      weekStart: start,
      weekEnd: end,
      studiedMinutes: await this.studiedThisWeek(userId, now),
    };
  }

  /** Verified minutes (closed sessions plus the live check-in) inside the Monday..Sunday ART week of `now`. */
  private async studiedThisWeek(userId: string, now: Date): Promise<number> {
    const { start, end } = artWeekBounds(localDateOf(now, DEFAULT_TIMEZONE));
    // One extra day back: a session that began on the previous Sunday night can spill into Monday.
    const intervals = await loadStudyIntervals(this.db, userId, addDays(start, -1), now);
    return minutesBetween(intervals, startOfLocalDay(start, DEFAULT_TIMEZONE), nextLocalMidnight(end, DEFAULT_TIMEZONE));
  }
}
