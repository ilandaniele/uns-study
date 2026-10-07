import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window hit counters for the Postgres-backed rate limiter (used when neither Upstash nor a
 * standard Redis server is configured — see `apps/api/src/security/rate-limit.service.ts`). One
 * row per `(key, window_start)`; `count` is incremented atomically via `INSERT ... ON CONFLICT`.
 */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] }), index("idx_rate_limit_hits_window_start").on(table.windowStart)],
);
