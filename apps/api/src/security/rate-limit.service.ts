import { and, eq, lt, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";

const CLEANUP_INTERVAL_MS = 60 * 1000;
const CLEANUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MEMORY_PRUNE_INTERVAL_MS = 60 * 1000;
const MEMORY_MAX_ENTRIES = 50_000;
const OWNER_LOOKUP_TTL_MS = 5 * 60 * 1000;

/**
 * Windows up to this long are counted in memory. The API is one Durable Object, and a SQLite upsert
 * per check (3 rows written with indexes) burned the Workers Free `rows_written` budget. Counts
 * reset when the DO is evicted, which is acceptable for short windows; longer (hourly/daily) limits
 * stay in SQLite so they survive eviction.
 */
export const IN_MEMORY_MAX_WINDOW_SECONDS = 600;

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
 * Same sliding-window-counter algorithm as `SqliteWindow` (current fixed-window count blended with
 * the previous window's), held in a Map so short windows never touch SQLite. Expired entries are
 * pruned at most once a minute and the map is capped so memory can't grow unbounded.
 */
export class MemoryWindowCounter {
  private readonly counts = new Map<string, { windowStart: number; windowMs: number; count: number }>();
  private lastPruneAt = 0;

  check(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    const windowStartMs = Math.floor(now / windowMs) * windowMs;
    this.prune(now);

    const currentId = `${key}|${windowStartMs}`;
    const current = this.counts.get(currentId);
    const currentCount = (current?.count ?? 0) + 1;
    if (current) current.count = currentCount;
    else this.counts.set(currentId, { windowStart: windowStartMs, windowMs, count: 1 });
    const previousCount = this.counts.get(`${key}|${windowStartMs - windowMs}`)?.count ?? 0;

    const overlap = Math.max(0, 1 - (now - windowStartMs) / windowMs);
    const weighted = currentCount + previousCount * overlap;
    if (weighted > limit) return { allowed: false, remaining: 0 };
    return { allowed: true, remaining: Math.max(0, Math.floor(limit - weighted)) };
  }

  /** A window is dead once the next one has also ended (it is no longer the "previous" window). */
  private isExpired(e: { windowStart: number; windowMs: number }, now: number): boolean {
    return e.windowStart + 2 * e.windowMs <= now;
  }

  private prune(now: number): void {
    const overCap = this.counts.size >= MEMORY_MAX_ENTRIES;
    if (!overCap && now - this.lastPruneAt < MEMORY_PRUNE_INTERVAL_MS) return;
    this.lastPruneAt = now;
    for (const [id, e] of this.counts) if (this.isExpired(e, now)) this.counts.delete(id);
    // Still full of live entries: drop the oldest (Map keeps insertion order) down to 90% of the cap.
    let excess = this.counts.size - Math.floor(MEMORY_MAX_ENTRIES * 0.9);
    if (excess <= 0 || !overCap) return;
    for (const id of this.counts.keys()) {
      this.counts.delete(id);
      if (--excess <= 0) break;
    }
  }
}

/**
 * Sliding-window rate limiting. With a database (always, in the Worker) it uses the SQLite
 * `rate_limit_hits` table for windows longer than `IN_MEMORY_MAX_WINDOW_SECONDS`, and counts shorter
 * ones in memory; without a database everything uses an in-process window (unit tests).
 */
export class RateLimitService {
  private readonly memory = new MemoryWindow();
  private readonly shortWindows = new MemoryWindowCounter();
  private readonly sqliteWindow: SqliteWindow | null;
  private owner: { id: string | null; at: number } | null = null;

  /**
   * `ownerEmail`: the app owner's account (verified email only) is never rate limited. Its user id
   * is looked up once and cached for a few minutes; buckets keyed `<name>:<userId>` for that id pass
   * without counting. IP- or email-keyed buckets still apply.
   */
  constructor(
    private readonly db?: Db,
    private readonly ownerEmail?: string,
  ) {
    this.sqliteWindow = db ? new SqliteWindow(db) : null;
  }

  private async ownerId(): Promise<string | null> {
    if (!this.db || !this.ownerEmail) return null;
    const now = Date.now();
    if (this.owner && now - this.owner.at < OWNER_LOOKUP_TTL_MS) return this.owner.id;
    try {
      const [u] = await this.db
        .select({ id: schema.user.id, emailVerified: schema.user.emailVerified })
        .from(schema.user)
        .where(eq(schema.user.email, this.ownerEmail))
        .limit(1);
      this.owner = { id: u && u.emailVerified === true ? u.id : null, at: now };
    } catch {
      this.owner = { id: null, at: now };
    }
    return this.owner.id;
  }

  /** `key` should already include the bucket name, e.g. `checkin:<userId>`. */
  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const owner = await this.ownerId();
    if (owner && key.endsWith(`:${owner}`)) return { allowed: true, remaining: limit };

    if (this.sqliteWindow) {
      if (windowSeconds <= IN_MEMORY_MAX_WINDOW_SECONDS) {
        return this.shortWindows.check(key, limit, windowSeconds * 1000);
      }
      return this.sqliteWindow.check(key, limit, windowSeconds * 1000);
    }

    return this.memory.check(key, limit, windowSeconds * 1000);
  }
}
