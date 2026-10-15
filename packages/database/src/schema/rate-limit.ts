import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Fixed-window hit counters for the Durable Object SQLite rate limiter. One
 * row per `(key, window_start)`; `count` is incremented atomically via `INSERT ... ON CONFLICT`.
 */
export const rateLimitHits = sqliteTable(
  "rate_limit_hits",
  {
    key: text("key").notNull(),
    windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })],
);
