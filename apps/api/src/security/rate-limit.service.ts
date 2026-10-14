import { and, eq, lt, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";

const CLEANUP_INTERVAL_MS = 60 * 1000;
const CLEANUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** One JSON line per backend failure (no keys/IPs) so a fail-closed outage is visible in the logs. */
function logBackendError(backend: "sqlite" | "sqlite_cleanup", err: unknown): void {
  console.error(JSON.stringify({ evt: "rate_limit_backend_error", backend, msg: err instanceof Error ? err.message : String(err) }));
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/** In-memory sliding-window limiter, used only when no database is given (unit tests). */
class MemoryWindow {
  private hits = new Map<string, number[]>();

  check(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (timestamps.length >= limit) {
      this.hits.set(key, timestamps);
      return { allowed: false, remaining: 0 };
    }
    timestamps.push(now);
    this.hits.set(key, timestamps);
    return { allowed: true, remaining: limit - timestamps.length };
  }
}

/**
 * Fixed-window-counter limiter backed by SQLite (`rate_limit_hits`). Each call increments the
 * counter for the current fixed window (`INSERT ... ON CONFLICT ... DO UPDATE SET count = count + 1
 * RETURNING count`) and approximates a sliding window by blending in the previous window's count,
 * weighted by how much of it still overlaps the sliding lookback (the classic "sliding window
 * counter" algorithm). The increment and the previous-window read run in one synchronous
 * transaction, so concurrent callers (one Durable Object thread) can't race past the limit.
 */
export class SqliteWindow {
  private lastCleanupAt = 0;

  constructor(private readonly db: Db) {}

  check(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    const windowStartMs = Math.floor(now / windowMs) * windowMs;
    const windowStart = new Date(windowStartMs);
    const previousWindowStart = new Date(windowStartMs - windowMs);

    try {
      const { currentCount, previousCount } = this.db.transaction((tx) => {
        const [current] = tx
          .insert(schema.rateLimitHits)
          .values({ key, windowStart, count: 1 })
          .onConflictDoUpdate({
            target: [schema.rateLimitHits.key, schema.rateLimitHits.windowStart],
            set: { count: sql`${schema.rateLimitHits.count} + 1` },
          })
          .returning({ count: schema.rateLimitHits.count })
          .all();

        const [previous] = tx
          .select({ count: schema.rateLimitHits.count })
          .from(schema.rateLimitHits)
          .where(and(eq(schema.rateLimitHits.key, key), eq(schema.rateLimitHits.windowStart, previousWindowStart)))
          .limit(1)
          .all();
        return { currentCount: current?.count ?? 1, previousCount: previous?.count ?? 0 };
      });

      const overlap = Math.max(0, 1 - (now - windowStartMs) / windowMs);
      const weighted = currentCount + previousCount * overlap;

      this.cleanupOpportunistically(now);

      if (weighted > limit) {
        return { allowed: false, remaining: 0 };
      }
      return { allowed: true, remaining: Math.max(0, Math.floor(limit - weighted)) };
    } catch (err) {
      logBackendError("sqlite", err);
      // Fail closed: a database failure must not silently disable rate limiting.
      return { allowed: false, remaining: 0 };
    }
  }

  /** Deletes windows older than a day, at most once per minute. Best-effort. */
  private cleanupOpportunistically(now: number): void {
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.lastCleanupAt = now;
    try {
      this.db
        .delete(schema.rateLimitHits)
        .where(lt(schema.rateLimitHits.windowStart, new Date(now - CLEANUP_MAX_AGE_MS)))
        .run();
    } catch (err) {
      // best effort
      logBackendError("sqlite_cleanup", err);
    }
  }
}

/**
 * Sliding-window rate limiting. With a database (always, in the Worker) it uses the SQLite
 * `rate_limit_hits` table; without one it falls back to an in-process window (unit tests).
 */
export class RateLimitService {
  private readonly memory = new MemoryWindow();
  private readonly sqliteWindow: SqliteWindow | null;

  constructor(db?: Db) {
    this.sqliteWindow = db ? new SqliteWindow(db) : null;
  }

  /** `key` should already include the bucket name, e.g. `checkin:<userId>`. */
  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    if (this.sqliteWindow) {
      return this.sqliteWindow.check(key, limit, windowSeconds * 1000);
    }

    return this.memory.check(key, limit, windowSeconds * 1000);
  }
}
