import { describe, expect, it, vi } from "vitest";
import { AntiAbuseService } from "./anti-abuse.service.js";
import type { RateLimitService } from "./rate-limit.service.js";
import type { SecurityEventService } from "./security-event.service.js";
import type { AbusePolicyService } from "./abuse-policy.service.js";
import type { TurnstileService } from "./turnstile.service.js";

function build(opts: { allowed?: boolean; challenge?: boolean; verified?: boolean }) {
  const record = vi.fn(async () => {});
  const svc = new AntiAbuseService(
    { check: async () => ({ allowed: opts.allowed ?? true }) } as unknown as RateLimitService,
    { record } as unknown as SecurityEventService,
    { requiresChallenge: async () => opts.challenge ?? false } as unknown as AbusePolicyService,
    { verify: async () => opts.verified ?? false } as unknown as TurnstileService,
  );
  return { svc, record };
}

describe("AntiAbuseService", () => {
  it("passes when under the limit and records nothing", async () => {
    const { svc, record } = build({ allowed: true });
    await svc.enforceRateLimit({ key: "k", limit: 1, windowSeconds: 1, event: { userId: "u1", eventType: "RATE_LIMITED" } });
    expect(record).not.toHaveBeenCalled();
  });

  it("throws RATE_LIMITED and records the event when over the limit", async () => {
    const { svc, record } = build({ allowed: false });
    await expect(
      svc.enforceRateLimit({ key: "k", limit: 1, windowSeconds: 1, event: { userId: "u1", eventType: "RATE_LIMITED" } }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(record).toHaveBeenCalledOnce();
  });

  it("throws RATE_LIMITED without an event when none is configured", async () => {
    const { svc, record } = build({ allowed: false });
    await expect(svc.enforceRateLimit({ key: "k", limit: 1, windowSeconds: 1 })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(record).not.toHaveBeenCalled();
  });

  it("skips the challenge when the user is not flagged", async () => {
    const { svc } = build({ challenge: false });
    await expect(svc.assertChallengePassed("u1", undefined, "1.1.1.1")).resolves.toBeUndefined();
  });

  it("requires Turnstile for a flagged user; no event when no token was sent", async () => {
    const { svc, record } = build({ challenge: true, verified: false });
    await expect(svc.assertChallengePassed("u1", undefined, "1.1.1.1")).rejects.toMatchObject({ code: "TURNSTILE_REQUIRED" });
    expect(record).not.toHaveBeenCalled();
  });

  it("records TURNSTILE_FAILED when a bad token was sent", async () => {
    const { svc, record } = build({ challenge: true, verified: false });
    await expect(svc.assertChallengePassed("u1", "bad", "1.1.1.1")).rejects.toMatchObject({ code: "TURNSTILE_REQUIRED" });
    expect(record).toHaveBeenCalledWith({ userId: "u1", eventType: "TURNSTILE_FAILED", ip: "1.1.1.1" });
  });

  it("passes a flagged user with a valid token", async () => {
    const { svc } = build({ challenge: true, verified: true });
    await expect(svc.assertChallengePassed("u1", "ok", "1.1.1.1")).resolves.toBeUndefined();
  });
});
