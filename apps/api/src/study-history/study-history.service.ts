import type { Db } from "@sala/database";
import type { StudyHistoryDto } from "@sala/contracts";
import { DEFAULT_TIMEZONE, localDateOf } from "../common/dates.js";
import type { Clock } from "../platform/clock.js";
import { aggregateHistory } from "./history-aggregate.js";
import { loadFrozenDates } from "./frozen-dates.js";
import { addDays, STREAK_LOOKBACK_DAYS } from "./streak.js";
import { loadStudyIntervals, minutesByDay } from "./study-intervals.js";

/** Pro study history: everything is computed on read from `study_sessions` plus the live check-in. */
export class StudyHistoryService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async history(userId: string, days: 30 | 90): Promise<StudyHistoryDto> {
    const now = this.clock.now();
    const tz = DEFAULT_TIMEZONE;
    const today = localDateOf(now, tz);
    const since = addDays(today, -STREAK_LOOKBACK_DAYS);
    // One query reaches back far enough for the streak; the window is sliced from it.
    const intervals = await loadStudyIntervals(this.db, userId, since, now);
    const frozen = (await loadFrozenDates(this.db, [userId], since)).get(userId) ?? new Set<string>();
    return aggregateHistory(intervals, frozen, minutesByDay(intervals, tz), today, days, tz);
  }
}
