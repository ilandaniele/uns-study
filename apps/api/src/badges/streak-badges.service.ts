import { and, eq, like } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { BadgesDto, StreakDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { localDateOf, DEFAULT_TIMEZONE } from "../common/dates.js";
import { isMissingSchemaError } from "../common/sqlite-errors.js";
import type { Clock } from "../platform/clock.js";
import { addDays, computeStreaks, qualifyingDays, STREAK_LOOKBACK_DAYS, STREAK_MIN_MINUTES } from "../study-history/streak.js";
import { loadFrozenDates } from "../study-history/frozen-dates.js";
import { loadStudyIntervals, minutesByDay } from "../study-history/study-intervals.js";
import { evaluateBadges, hasEarlyStart, hasLateMinutes } from "./badge-rules.js";

/** A day can be frozen when it is at most this many days back (today excluded). */
const FREEZE_WINDOW_DAYS = 7;
const ALL_TIME = "0000-01-01";

const monthOf = (localDate: string) => localDate.slice(0, 7);

/** Pro streak (with one freeze a month) and the badges everyone can see. All computed on read. */
export class StreakBadgesService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async streak(userId: string): Promise<StreakDto> {
    const now = this.clock.now();
    const today = localDateOf(now, DEFAULT_TIMEZONE);
    const since = addDays(today, -STREAK_LOOKBACK_DAYS);
    const intervals = await loadStudyIntervals(this.db, userId, since, now);
    return this.buildStreak(userId, today, since, minutesByDay(intervals, DEFAULT_TIMEZONE));
  }

  async freeze(userId: string, localDate: string): Promise<StreakDto> {
    const now = this.clock.now();
    const today = localDateOf(now, DEFAULT_TIMEZONE);
    if (localDate < addDays(today, -FREEZE_WINDOW_DAYS) || localDate > addDays(today, -1)) {
      throw ApiErrors.validation("Solo podés congelar un día de los últimos 7, sin contar hoy.");
    }

    const since = addDays(today, -STREAK_LOOKBACK_DAYS);
    const intervals = await loadStudyIntervals(this.db, userId, since, now);
    const byDay = minutesByDay(intervals, DEFAULT_TIMEZONE);
    if ((byDay.get(localDate) ?? 0) >= STREAK_MIN_MINUTES) throw ApiErrors.validation("Ese día ya cuenta para tu racha.");

    try {
      this.db.transaction((tx) => {
        const [same] = tx
          .select({ localDate: schema.streakFreezes.localDate })
          .from(schema.streakFreezes)
          .where(and(eq(schema.streakFreezes.userId, userId), eq(schema.streakFreezes.localDate, localDate)))
          .limit(1)
          .all();
        if (same) return; // already frozen: idempotent
        const [sameMonth] = tx
          .select({ localDate: schema.streakFreezes.localDate })
          .from(schema.streakFreezes)
          .where(and(eq(schema.streakFreezes.userId, userId), like(schema.streakFreezes.localDate, `${monthOf(localDate)}-%`)))
          .limit(1)
          .all();
        if (sameMonth) throw ApiErrors.validation("Ya usaste el congelamiento de este mes.");
        tx.insert(schema.streakFreezes).values({ userId, localDate }).onConflictDoNothing().run();
      });
    } catch (err) {
      if (isMissingSchemaError(err)) throw ApiErrors.featureDisabled();
      throw err;
    }
    return this.buildStreak(userId, today, since, byDay);
  }

  async badges(userId: string): Promise<BadgesDto> {
    const summary = await this.badgeSummary(userId);
    return { badges: summary.badges };
  }

  async badgeSummary(userId: string) {
    const now = this.clock.now();
    const today = localDateOf(now, DEFAULT_TIMEZONE);
    const since = addDays(today, -STREAK_LOOKBACK_DAYS);
    const intervals = await loadStudyIntervals(this.db, userId, ALL_TIME, now);
    const allDays = minutesByDay(intervals, DEFAULT_TIMEZONE);
    const recent = new Map([...allDays].filter(([day]) => day >= since));
    const frozen = (await loadFrozenDates(this.db, [userId], since)).get(userId) ?? new Set<string>();
    const { longest } = computeStreaks(qualifyingDays(recent), frozen, today);
    return {
      stats: { studyMinutes: Math.max(0, Math.floor(intervals.reduce((sum, interval) => sum + interval.minutes, 0))), studyDays: qualifyingDays(allDays).size, longestStreak: longest },
      badges: evaluateBadges({
        totalMinutes: intervals.reduce((sum, i) => sum + i.minutes, 0),
        sessionCount: intervals.length,
        longestStreak: longest,
        hasEarly: hasEarlyStart(intervals, DEFAULT_TIMEZONE),
        hasLate: hasLateMinutes(intervals, DEFAULT_TIMEZONE),
      }),
    };
  }

  private async buildStreak(userId: string, today: string, since: string, byDay: ReadonlyMap<string, number>): Promise<StreakDto> {
    const frozen = (await loadFrozenDates(this.db, [userId], since)).get(userId) ?? new Set<string>();
    const { current, longest } = computeStreaks(qualifyingDays(byDay), frozen, today);
    const frozenMonths = new Set([...frozen].map(monthOf));
    const freezableDates: string[] = [];
    for (let back = FREEZE_WINDOW_DAYS; back >= 1; back--) {
      const day = addDays(today, -back);
      if ((byDay.get(day) ?? 0) < STREAK_MIN_MINUTES && !frozen.has(day) && !frozenMonths.has(monthOf(day))) freezableDates.push(day);
    }
    return {
      current,
      longest,
      frozenDates: [...frozen].sort(),
      freezeAvailableThisMonth: !frozenMonths.has(monthOf(today)),
      freezableDates,
    };
  }
}
