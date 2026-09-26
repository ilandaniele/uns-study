import { Injectable } from "@nestjs/common";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import IORedis from "ioredis";
import { env } from "../env.js";

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

  reset(): void {
    this.hits.clear();
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
    } catch {
      // Fail closed: a Redis outage must not silently disable rate limiting.
      return { allowed: false, remaining: 0 };
    }
  }
}

/**
 * Sliding-window rate limiting. Backend is chosen in this order:
 *  1. Upstash Redis (REST) when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set.
 *  2. A standard Redis server via `REDIS_URL` (e.g. Render Key Value), using `ioredis`.
 *  3. An in-process window — dev/test only. Production with neither backend configured throws.
 */
@Injectable()
export class RateLimitService {
  private readonly memory = new MemoryWindow();
  private readonly upstash: Redis | null;
  private readonly redisWindow: RedisWindow | null;
  private readonly limiters = new Map<string, Ratelimit>();

  constructor() {
    const hasUpstash = Boolean(env.upstashUrl && env.upstashToken);
    const hasRedisUrl = Boolean(env.redisUrl);
    if (env.isProduction && !hasUpstash && !hasRedisUrl) {
      throw new Error(
        "UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN or REDIS_URL are required in production (no in-memory rate-limit fallback).",
      );
    }
    this.upstash = hasUpstash ? new Redis({ url: env.upstashUrl, token: env.upstashToken }) : null;
    this.redisWindow = !hasUpstash && hasRedisUrl ? new RedisWindow(createRedisClient(env.redisUrl)) : null;
  }

  /** `key` should already include the bucket name, e.g. `checkin:<userId>`. */
  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    if (this.upstash) {
      const cacheKey = `${limit}:${windowSeconds}`;
      let limiter = this.limiters.get(cacheKey);
      if (!limiter) {
        limiter = new Ratelimit({ redis: this.upstash, limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`), prefix: "uns" });
        this.limiters.set(cacheKey, limiter);
      }
      const result = await limiter.limit(key);
      return { allowed: result.success, remaining: result.remaining };
    }

    if (this.redisWindow) {
      return this.redisWindow.check(key, limit, windowSeconds * 1000);
    }

    return this.memory.check(key, limit, windowSeconds * 1000);
  }

  /** Test/dev helper. */
  resetMemory(): void {
    this.memory.reset();
  }
}

function createRedisClient(url: string): IORedis {
  return new IORedis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
}
