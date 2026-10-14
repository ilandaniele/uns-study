import { Inject, Injectable, Optional } from "@nestjs/common";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, eq, lt, sql } from "drizzle-orm";
import IORedis from "ioredis";
import { schema, type Db } from "@sala/database";
import { DB } from "../database/database.module.js";
import { env } from "../env.js";

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const CLEANUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** One JSON line per backend failure (no keys/IPs) so a fail-closed outage is visible in `fly logs`. */
function logBackendError(backend: "redis" | "postgres" | "postgres_cleanup", err: unknown): void {
  console.error(JSON.stringify({ evt: "rate_limit_backend_error", backend, msg: err instanceof Error ? err.message : String(err) }));
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/** In-memory sliding-window limiter, used when no Redis backend is configured. */
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

/** Minimal shape of the ioredis client (and its `ioredis-mock` stand-in) this module needs. */
export interface RedisLike {
  multi(): {
    zremrangebyscore(key: string, min: number | string, max: number | string): unknown;
    zadd(key: string, score: number, member: string): unknown;
    zcard(key: string): unknown;
    pexpire(key: string, ms: number): unknown;
    exec(): Promise<Array<[Error | null, unknown]> | null>;
  };
  zrem(key: string, member: string): Promise<unknown>;
}

/**
 * Sliding-window-log limiter backed by a standard Redis server (Render Key Value, etc.), reached
 * via `REDIS_URL`. Each call records an entry in a sorted set keyed `rl:<key>`, scored by
 * timestamp, then trims anything older than the window and counts what's left — all inside a
 * single MULTI so concurrent callers can't race past the limit.
 */
export class RedisWindow {
  constructor(private readonly client: RedisLike) {}

  async check(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
    const redisKey = `rl:${key}`;
    const windowStart = now - windowMs;
    const member = `${now}:${Math.random().toString(36).slice(2)}`;

    try {
      const multi = this.client.multi();
      multi.zremrangebyscore(redisKey, 0, windowStart);
      multi.zadd(redisKey, now, member);
      multi.zcard(redisKey);
      multi.pexpire(redisKey, windowMs);
      const results = await multi.exec();
      if (!results) {
        return { allowed: false, remaining: 0 };
      }
      const countResult = results[2];
      if (!countResult || countResult[0]) {
        return { allowed: false, remaining: 0 };
      }
      const count = countResult[1] as number;
      if (count > limit) {
        await this.client.zrem(redisKey, member);
        return { allowed: false, remaining: 0 };
      }
      return { allowed: true, remaining: limit - count };
    } catch (err) {
      logBackendError("redis", err);
      // Fail closed: a Redis outage must not silently disable rate limiting.
      return { allowed: false, remaining: 0 };
    }
  }
}

/**
 * Fixed-window-counter limiter backed by Postgres (`rate_limit_hits`), used when neither Upstash
 * nor `REDIS_URL` is configured — which in production means "always", since `DATABASE_URL` is a
 * required env var there. Each call atomically increments the counter for the current fixed
 * window (`INSERT ... ON CONFLICT ... DO UPDATE SET count = count + 1 RETURNING count`) and
 * approximates a sliding window by blending in the previous window's count, weighted by how much
 * of it still overlaps the sliding lookback (the classic "sliding window counter" algorithm).
 */
export class PostgresWindow {
  private lastCleanupAt = 0;

  constructor(private readonly db: Db) {}

  async check(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
    const windowStartMs = Math.floor(now / windowMs) * windowMs;
    const windowStart = new Date(windowStartMs);
    const previousWindowStart = new Date(windowStartMs - windowMs);

    try {
      const [current] = await this.db
        .insert(schema.rateLimitHits)
        .values({ key, windowStart, count: 1 })
        .onConflictDoUpdate({
          target: [schema.rateLimitHits.key, schema.rateLimitHits.windowStart],
          set: { count: sql`${schema.rateLimitHits.count} + 1` },
        })
        .returning({ count: schema.rateLimitHits.count });
      const currentCount = current?.count ?? 1;

      const [previous] = await this.db
        .select({ count: schema.rateLimitHits.count })
        .from(schema.rateLimitHits)
        .where(and(eq(schema.rateLimitHits.key, key), eq(schema.rateLimitHits.windowStart, previousWindowStart)))
        .limit(1);
      const previousCount = previous?.count ?? 0;

      const overlap = Math.max(0, 1 - (now - windowStartMs) / windowMs);
      const weighted = currentCount + previousCount * overlap;

      this.cleanupOpportunistically(now);

      if (weighted > limit) {
        return { allowed: false, remaining: 0 };
      }
      return { allowed: true, remaining: Math.max(0, Math.floor(limit - weighted)) };
    } catch (err) {
      logBackendError("postgres", err);
      // Fail closed: a Postgres outage must not silently disable rate limiting.
      return { allowed: false, remaining: 0 };
    }
  }

  /** Deletes windows older than a day, at most once per 10 minutes per process. Best-effort. */
  private cleanupOpportunistically(now: number): void {
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.lastCleanupAt = now;
    void this.db
      .delete(schema.rateLimitHits)
      .where(lt(schema.rateLimitHits.windowStart, new Date(now - CLEANUP_MAX_AGE_MS)))
      .catch((err: unknown) => {
        // best effort
        logBackendError("postgres_cleanup", err);
      });
  }
}

/**
 * Sliding-window rate limiting. Backend is chosen in this order:
 *  1. Upstash Redis (REST) when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set.
 *  2. A standard Redis server via `REDIS_URL` (e.g. Render Key Value), using `ioredis`.
 *  3. Postgres (`rate_limit_hits`), in production, when neither Redis backend is configured —
 *     always available there since `DATABASE_URL` is required.
 *  4. An in-process window — dev/test only.
 */
@Injectable()
export class RateLimitService {
  private readonly memory = new MemoryWindow();
  private readonly upstash: Redis | null;
  private readonly redisWindow: RedisWindow | null;
  private readonly postgresWindow: PostgresWindow | null;
  private readonly limiters = new Map<string, Ratelimit>();

  constructor(@Optional() @Inject(DB) private readonly db?: Db) {
    const hasUpstash = Boolean(env.upstashUrl && env.upstashToken);
    const hasRedisUrl = Boolean(env.redisUrl);
    this.upstash = hasUpstash ? new Redis({ url: env.upstashUrl, token: env.upstashToken }) : null;
    this.redisWindow = !hasUpstash && hasRedisUrl ? new RedisWindow(createRedisClient(env.redisUrl)) : null;
    const usePostgres = !hasUpstash && !hasRedisUrl && env.isProduction && Boolean(this.db);
    this.postgresWindow = usePostgres ? new PostgresWindow(this.db!) : null;
  }

  /** `key` should already include the bucket name, e.g. `checkin:<userId>`. */
  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    if (this.upstash) {
      const cacheKey = `${limit}:${windowSeconds}`;
      let limiter = this.limiters.get(cacheKey);
      if (!limiter) {
        limiter = new Ratelimit({ redis: this.upstash, limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`), prefix: "sala" });
        this.limiters.set(cacheKey, limiter);
      }
      const result = await limiter.limit(key);
      return { allowed: result.success, remaining: result.remaining };
    }

    if (this.redisWindow) {
      return this.redisWindow.check(key, limit, windowSeconds * 1000);
    }

    if (this.postgresWindow) {
      return this.postgresWindow.check(key, limit, windowSeconds * 1000);
    }

    return this.memory.check(key, limit, windowSeconds * 1000);
  }
}

function createRedisClient(url: string): IORedis {
  return new IORedis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
}
