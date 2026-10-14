import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Multiplexes the single Durable Object alarm: one row per pending/recurring job. `interval_ms` null
 * means one-shot (the row is deleted when it runs); otherwise `due_at` is advanced before the handler
 * runs. Keys: "expiration", "summary:<roomId>", "admin-present:<userId>", ...
 */
export const scheduledJobs = sqliteTable(
  "scheduled_jobs",
  {
    key: text("key").primaryKey(),
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    intervalMs: integer("interval_ms"),
    payload: text("payload", { mode: "json" }).$type<unknown>(),
  },
  (t) => [index("idx_scheduled_jobs_due_at").on(t.dueAt)],
);
