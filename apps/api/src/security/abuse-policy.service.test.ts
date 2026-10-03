import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { RateLimitService } from "./rate-limit.service.js";
import { TurnstileService } from "./turnstile.service.js";
import { AbusePolicyService, OBSERVATION_LIMITS } from "./abuse-policy.service.js";

describe("AbusePolicyService", () => {
  let db: Db;
  let turnstile: TurnstileService;

  beforeEach(async () => {
    db = await freshDb();
    turnstile = new TurnstileService();
    turnstile.isEnabled = () => true; // simulate TURNSTILE_SECRET_KEY set, without a real secret
    await insertUsers(db, ["u1"]);
  });

  it("never requires a challenge when Turnstile is disabled, even with a flagging event", async () => {
    turnstile.isEnabled = () => false;
    await db.insert(schema.securityEvents).values({ userId: "u1", eventType: "SEAT_TOGGLE_RAPID" });
    const policy = new AbusePolicyService(db, turnstile);
    expect(await policy.requiresChallenge("u1")).toBe(false);
  });

  it("does not require a challenge for a clean user", async () => {
    const policy = new AbusePolicyService(db, turnstile);
    expect(await policy.requiresChallenge("u1")).toBe(false);
  });

  it("requires a challenge after a recent SEAT_TOGGLE_RAPID event", async () => {
    await db.insert(schema.securityEvents).values({ userId: "u1", eventType: "SEAT_TOGGLE_RAPID" });
    const policy = new AbusePolicyService(db, turnstile);
    expect(await policy.requiresChallenge("u1")).toBe(true);
  });

  it("requires a challenge after a recent OBSERVATION_SPREAD event", async () => {
    await db.insert(schema.securityEvents).values({ userId: "u1", eventType: "OBSERVATION_SPREAD" });
    const policy = new AbusePolicyService(db, turnstile);
    expect(await policy.requiresChallenge("u1")).toBe(true);
  });

  it("requires a challenge after a recent RATE_LIMITED event", async () => {
    await db.insert(schema.securityEvents).values({ userId: "u1", eventType: "RATE_LIMITED" });
    const policy = new AbusePolicyService(db, turnstile);
    expect(await policy.requiresChallenge("u1")).toBe(true);
  });

  it("ignores flagging events older than 30 minutes", async () => {
    const old = new Date(Date.now() - 31 * 60_000);
    await db.insert(schema.securityEvents).values({ userId: "u1", eventType: "SEAT_TOGGLE_RAPID", createdAt: old });
    const policy = new AbusePolicyService(db, turnstile);
    expect(await policy.requiresChallenge("u1")).toBe(false);
  });

  it("applies default observation limits to an account older than 24h", async () => {
    await insertUsers(db, ["old1"], { createdAt: new Date(Date.now() - 48 * 60 * 60_000) });
    const policy = new AbusePolicyService(db, turnstile);
    expect(await policy.observationLimits("old1")).toEqual(OBSERVATION_LIMITS.default);
  });

  it("applies stricter observation limits to an account younger than 24h", async () => {
    const policy = new AbusePolicyService(db, turnstile);
    expect(await policy.observationLimits("u1")).toEqual(OBSERVATION_LIMITS.newAccount);
  });

  it("a brand-new account hits the observation rate limit on its 4th request within a minute", async () => {
    const policy = new AbusePolicyService(db, turnstile);
    const rateLimit = new RateLimitService();

    const attempt = async () => {
      const limits = await policy.observationLimits("u1");
      return rateLimit.check(`observation:u1`, limits.perMinuteLimit, 60);
    };

    expect((await attempt()).allowed).toBe(true);
    expect((await attempt()).allowed).toBe(true);
    expect((await attempt()).allowed).toBe(true);
    expect((await attempt()).allowed).toBe(false); // 4th request blocked: new-account limit is 3/min
  });

  it("an established account is not blocked until its 7th request within a minute", async () => {
    await insertUsers(db, ["old2"], { createdAt: new Date(Date.now() - 48 * 60 * 60_000) });
    const policy = new AbusePolicyService(db, turnstile);
    const rateLimit = new RateLimitService();

    const attempt = async () => {
      const limits = await policy.observationLimits("old2");
      return rateLimit.check(`observation:old2`, limits.perMinuteLimit, 60);
    };

    for (let i = 0; i < 6; i++) {
      expect((await attempt()).allowed).toBe(true);
    }
    expect((await attempt()).allowed).toBe(false); // 7th request blocked: default limit is 6/min
  });
});
