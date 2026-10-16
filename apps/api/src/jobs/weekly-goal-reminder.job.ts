import { inArray } from "drizzle-orm";
import { chunk, schema, type Db } from "@sala/database";
import { DEFAULT_TIMEZONE, localDateOf } from "../common/dates.js";
import type { Clock } from "../platform/clock.js";
import { mapWithConcurrency } from "../notifications/concurrency.js";
import type { PushService } from "../notifications/push.service.js";
import { claimNotificationThrottle } from "../notifications/throttle.js";
import type { ProService } from "../subscriptions/pro.js";
import { artWeekBounds, weekdayOf } from "../study-history/streak.js";
import type { WeeklyGoalService } from "../weekly-goal/weekly-goal.service.js";
import { toZonedTime } from "date-fns-tz";

/** The reminder goes out on Sunday during this ART hour (18:00-18:59). */
const REMINDER_HOUR = 18;
const SUNDAY = 6;
/** Once per week per user; a little under 7 days so a slightly early next Sunday tick still claims. */
const THROTTLE_MINUTES = 6 * 24 * 60;
const SEND_CONCURRENCY = 10;

/** "2 h 30 min", "45 min" or "3 h". */
export function formatRemaining(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Scheduler entry point (`weekly-goal-reminder`, every 5 minutes): pushes the weekly goal reminder
 * to Pro users who are short of their goal. Outside Sunday 18:00-18:59 ART (and once the week is
 * done) it returns before touching the database.
 */
export class WeeklyGoalReminderJob {
  private doneWeek: string | null = null;

  constructor(
    private readonly db: Db,
    private readonly push: PushService,
    private readonly pro: ProService,
    private readonly weeklyGoal: WeeklyGoalService,
    private readonly clock: Clock,
  ) {}

  async tick(): Promise<void> {
    const now = this.clock.now();
    if (toZonedTime(now, DEFAULT_TIMEZONE).getHours() !== REMINDER_HOUR) return;
    const today = localDateOf(now, DEFAULT_TIMEZONE);
    if (weekdayOf(today) !== SUNDAY) return;
    const weekStart = artWeekBounds(today).start;
    if (this.doneWeek === weekStart) return;

    const short = (await this.weeklyGoal.reminderCandidates(now)).filter((c) => c.studiedMinutes < c.goalMinutes);
    if (short.length > 0) {
      const missing = new Map(short.map((c) => [c.userId, c.goalMinutes - c.studiedMinutes]));
      const pro = await this.pro.filterPro([...missing.keys()]);
      const withPush = await this.withPushSubscription([...pro]);
      const claimed = claimNotificationThrottle(this.db, withPush, "weekly_goal", THROTTLE_MINUTES, now);
      await mapWithConcurrency(claimed, SEND_CONCURRENCY, (userId) =>
        this.push.sendToUser(userId, {
          title: "Tu meta semanal",
          body: `Te faltan ${formatRemaining(missing.get(userId) ?? 0)} para tu meta de esta semana.`,
          url: "/perfil",
          tag: "weekly-goal",
        }),
      );
    }
    this.doneWeek = weekStart;
  }

  private async withPushSubscription(userIds: string[]): Promise<string[]> {
    const withSub = new Set<string>();
    for (const part of chunk(userIds, 90)) {
      const rows = await this.db
        .selectDistinct({ userId: schema.pushSubscriptions.userId })
        .from(schema.pushSubscriptions)
        .where(inArray(schema.pushSubscriptions.userId, part));
      for (const r of rows) withSub.add(r.userId);
    }
    return userIds.filter((id) => withSub.has(id));
  }
}
