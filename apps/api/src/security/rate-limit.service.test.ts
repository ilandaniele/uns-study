import RedisMock from "ioredis-mock";
import { describe, expect, it } from "vitest";
import { createDb, migrate } from "@uns/database";
import { PostgresWindow, RateLimitService } from "./rate-limit.service.js";

describe("RateLimitService (in-memory fallback)", () => {
  it("allows up to the limit within the window, then blocks", async () => {
    const svc = new RateLimitService();
    const key = "test:user1";
    for (let i = 0; i < 5; i++) {
      const result = await svc.check(key, 5, 60);
      expect(result.allowed).toBe(true);
    }
    const blocked = await svc.check(key, 5, 60);
    expect(blocked.allowed).toBe(false);
  });

  it("tracks separate keys independently", async () => {
    const svc = new RateLimitService();
    await svc.check("a", 1, 60);
    const resultB = await svc.check("b", 1, 60);
    expect(resultB.allowed).toBe(true);
  });
});

describe("RedisWindow (standard Redis via REDIS_URL)", () => {
  // Exercised directly against a `ioredis-mock` client rather than through `RateLimitService`,
  // since the service resolves its backend from `env` at construction time.
  async function makeWindow() {
    const { RedisWindow } = await import("./rate-limit.service.js");
    return new RedisWindow(new RedisMock());
  }

  it("allows up to the limit within the window, then blocks", async () => {
    const window = await makeWindow();
    const key = "test:redis-user1";
    for (let i = 0; i < 5; i++) {
      const result = await window.check(key, 5, 60_000);
      expect(result.allowed).toBe(true);
    }
    const blocked = await window.check(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
  });

  it("expires old entries once the window has elapsed", async () => {
    const window = await makeWindow();
    const key = "test:redis-expiry";
    const start = Date.now();
    for (let i = 0; i < 3; i++) {
      expect((await window.check(key, 3, 1_000, start)).allowed).toBe(true);
    }
    expect((await window.check(key, 3, 1_000, start)).allowed).toBe(false);
    expect((await window.check(key, 3, 1_000, start + 1_001)).allowed).toBe(true);
  });

  it("tracks separate keys independently", async () => {
    const window = await makeWindow();
    await window.check("a", 1, 60_000);
    const resultB = await window.check("b", 1, 60_000);
    expect(resultB.allowed).toBe(true);
  });
});

describe("PostgresWindow (Postgres fallback, no Redis configured)", () => {
  async function makeWindow() {
    const db = createDb({ pgliteDir: "memory://" });
    await migrate(db, "");
    return new PostgresWindow(db);
  }

  it("allows up to the limit within a fixed window, then blocks", async () => {
    const window = await makeWindow();
    const key = "test:pg-user1";
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
      const result = await window.check(key, 5, 60_000, now);
      expect(result.allowed).toBe(true);
    }
    const blocked = await window.check(key, 5, 60_000, now);
    expect(blocked.allowed).toBe(false);
  });

  it("tracks separate keys independently", async () => {
    const window = await makeWindow();
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    await window.check("a", 1, 60_000, now);
    const resultB = await window.check("b", 1, 60_000, now);
    expect(resultB.allowed).toBe(true);
  });

  it("weighs the previous window's count by its remaining overlap (sliding window counter)", async () => {
    const window = await makeWindow();
    const key = "test:pg-sliding";
    const windowMs = 60_000;
    const windowStart = Date.UTC(2026, 0, 1, 0, 0, 0);

    // Fill the first window to the limit.
    for (let i = 0; i < 4; i++) {
      expect((await window.check(key, 4, windowMs, windowStart + i)).allowed).toBe(true);
    }

    // Just after the window rolls over, the previous window's hits still weigh heavily (~100%
    // overlap), so a new hit should be rejected.
    const justAfterRollover = windowStart + windowMs + 1;
    expect((await window.check(key, 4, windowMs, justAfterRollover)).allowed).toBe(false);

    // Near the end of the *next* window, the previous window's overlap has decayed to ~0, so
    // fresh hits in the new window are allowed again up to the limit.
    const nearEndOfNextWindow = windowStart + windowMs * 2 - 1;
    expect((await window.check(key, 4, windowMs, nearEndOfNextWindow)).allowed).toBe(true);
  });

  it("fixed windows expire once fully elapsed", async () => {
    const window = await makeWindow();
    const key = "test:pg-expiry";
    const windowMs = 1_000;
    const start = Date.UTC(2026, 0, 1, 0, 0, 0);
    for (let i = 0; i < 3; i++) {
      expect((await window.check(key, 3, windowMs, start)).allowed).toBe(true);
    }
    expect((await window.check(key, 3, windowMs, start)).allowed).toBe(false);
    // Two windows later, the previous window's overlap has fully decayed.
    expect((await window.check(key, 3, windowMs, start + windowMs * 2)).allowed).toBe(true);
  });
});
