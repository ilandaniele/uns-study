import { Injectable } from "@nestjs/common";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "../env.js";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/** In-memory sliding-window limiter, used when Upstash env vars are not configured. */
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

/**
 * Sliding-window rate limiting. Uses Upstash Redis (REST) when configured, otherwise falls back
 * to an in-process window — fine for a single-instance MVP deployment/tests.
 */
@Injectable()
export class RateLimitService {
  private readonly memory = new MemoryWindow();
  private readonly redis: Redis | null;
  private readonly limiters = new Map<string, Ratelimit>();

  constructor() {
    if (env.isProduction && !(env.upstashUrl && env.upstashToken)) {
      throw new Error("UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are required in production (no in-memory rate-limit fallback).");
    }
    this.redis = env.upstashUrl && env.upstashToken ? new Redis({ url: env.upstashUrl, token: env.upstashToken }) : null;
  }

  /** `key` should already include the bucket name, e.g. `checkin:<userId>`. */
  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    if (!this.redis) {
      return this.memory.check(key, limit, windowSeconds * 1000);
    }

    const cacheKey = `${limit}:${windowSeconds}`;
    let limiter = this.limiters.get(cacheKey);
    if (!limiter) {
      limiter = new Ratelimit({ redis: this.redis, limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`), prefix: "uns" });
      this.limiters.set(cacheKey, limiter);
    }
    const result = await limiter.limit(key);
    return { allowed: result.success, remaining: result.remaining };
  }

  /** Test/dev helper. */
  resetMemory(): void {
    this.memory.reset();
  }
}
