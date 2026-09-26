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
