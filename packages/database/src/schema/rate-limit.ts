import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Fixed-window hit counters for the Postgres-backed rate limiter. One
 * row per `(key, window_start)`; `count` is incremented atomically via `INSERT ... ON CONFLICT`.
 */
export const rateLimitHits = sqliteTable(
  "rate_limit_hits",
  {
    key: text("key").notNull(),
    windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] }), index("idx_rate_limit_hits_window_start").on(table.windowStart)],
);
