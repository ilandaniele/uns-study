import { lt } from "drizzle-orm";
import { chunk, rowsPerInsert, schema, type Db } from "@sala/database";

/**
 * Atomically claims the notification throttle for each user: returns the subset that had not been
 * notified of `type` in the last `minutes` and records `now` for them. One transaction, so two
 * concurrent callers can never both claim the same user.
 */
export function claimNotificationThrottle(db: Db, userIds: string[], type: string, minutes: number, now: Date): string[] {
  if (userIds.length === 0) return [];
  const cutoff = new Date(now.getTime() - minutes * 60_000);
  const claimed: string[] = [];
  db.transaction((tx) => {
    for (const part of chunk(userIds, rowsPerInsert(3, 2))) {
      const rows = tx
        .insert(schema.notificationThrottles)
        .values(part.map((userId) => ({ userId, type, lastNotifiedAt: now })))
        .onConflictDoUpdate({
          target: [schema.notificationThrottles.userId, schema.notificationThrottles.type],
          set: { lastNotifiedAt: now },
          setWhere: lt(schema.notificationThrottles.lastNotifiedAt, cutoff),
        })
        .returning({ userId: schema.notificationThrottles.userId })
        .all();
      claimed.push(...rows.map((r) => r.userId));
    }
  });
  return claimed;
}
