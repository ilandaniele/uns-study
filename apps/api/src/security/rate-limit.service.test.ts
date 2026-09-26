import RedisMock from "ioredis-mock";
import { describe, expect, it } from "vitest";
import { RateLimitService } from "./rate-limit.service.js";

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
