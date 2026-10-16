import { describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import { FixedClock } from "../platform/clock.js";
import { RolesService } from "../users/roles.service.js";
import { freshDb, insertUsers } from "../test-utils.js";
import { hasPaidEntitlement, hasProEntitlement, isPro, ProService, type EntitlementInput } from "./pro.js";

const now = new Date("2026-10-16T12:00:00Z");
const future = new Date("2026-11-16T12:00:00Z");
const past = new Date("2026-10-01T12:00:00Z");

function input(over: Partial<EntitlementInput>): EntitlementInput {
  return { subscriptionStatus: null, currentPeriodEnd: null, roles: [], now, ...over };
}

describe("hasProEntitlement", () => {
  it("is true for an authorized subscriber", () => {
    expect(hasProEntitlement(input({ subscriptionStatus: "authorized" }))).toBe(true);
  });

  it("is true for a cancelled subscription with a future period end", () => {
    expect(hasProEntitlement(input({ subscriptionStatus: "cancelled", currentPeriodEnd: future }))).toBe(true);
  });

  it("is false for a cancelled subscription with a past or null period end", () => {
    expect(hasProEntitlement(input({ subscriptionStatus: "cancelled", currentPeriodEnd: past }))).toBe(false);
    expect(hasProEntitlement(input({ subscriptionStatus: "cancelled", currentPeriodEnd: null }))).toBe(false);
  });

  it("is true for a paused subscription with a future period end", () => {
    expect(hasProEntitlement(input({ subscriptionStatus: "paused", currentPeriodEnd: future }))).toBe(true);
  });

  it("is false for a pending subscription and for no subscription", () => {
    expect(hasProEntitlement(input({ subscriptionStatus: "pending", currentPeriodEnd: future }))).toBe(false);
    expect(hasProEntitlement(input({}))).toBe(false);
  });

  it("is true for staff without a subscription", () => {
    expect(hasProEntitlement(input({ roles: ["ADMIN"] }))).toBe(true);
    expect(hasProEntitlement(input({ roles: ["MODERATOR"], subscriptionStatus: "cancelled" }))).toBe(true);
  });
});

describe("hasPaidEntitlement", () => {
  it("only counts payments, never staff", () => {
    expect(hasPaidEntitlement({ subscriptionStatus: null, currentPeriodEnd: null, now })).toBe(false);
    expect(hasPaidEntitlement({ subscriptionStatus: "authorized", currentPeriodEnd: null, now })).toBe(true);
    expect(hasPaidEntitlement({ subscriptionStatus: "paused", currentPeriodEnd: future, now })).toBe(true);
    expect(hasPaidEntitlement({ subscriptionStatus: "paused", currentPeriodEnd: past, now })).toBe(false);
  });
});

describe("isPro", () => {
  it("is true for everyone when subscriptions are disabled", () => {
    expect(isPro({ ...input({}), subscriptionsEnabled: false })).toBe(true);
  });

  it("follows the entitlement when subscriptions are enabled", () => {
    expect(isPro({ ...input({}), subscriptionsEnabled: true })).toBe(false);
    expect(isPro({ ...input({ subscriptionStatus: "authorized" }), subscriptionsEnabled: true })).toBe(true);
  });
});

describe("ProService", () => {
  async function seed() {
    const db = freshDb();
    await insertUsers(db, ["paid", "lapsed", "staff", "free"]);
    const sub = (userId: string, status: string, currentPeriodEnd: Date | null) =>
      db.insert(schema.userSubscriptions).values({ userId, providerSubscriptionId: `sub-${userId}`, status, currentPeriodEnd }).run();
    sub("paid", "authorized", null);
    sub("lapsed", "cancelled", past);
    db.insert(schema.userRoles).values({ userId: "staff", role: "ADMIN" }).run();
    return db;
  }

  it("answers isProUser, filterPro and badgeIds consistently", async () => {
    const db = await seed();
    const pro = new ProService(db, new RolesService(db), { subscriptionsEnabled: true, clock: new FixedClock(now) });
    expect(await pro.isProUser("paid")).toBe(true);
    expect(await pro.isProUser("staff")).toBe(true);
    expect(await pro.isProUser("lapsed")).toBe(false);
    expect(await pro.isProUser("free")).toBe(false);
    expect([...(await pro.filterPro(["paid", "lapsed", "staff", "free"]))].sort()).toEqual(["paid", "staff"]);
    expect([...(await pro.badgeIds(["paid", "lapsed", "staff", "free"]))]).toEqual(["paid"]);
    expect((await pro.filterPro([])).size).toBe(0);
  });

  it("treats everyone as Pro when subscriptions are disabled", async () => {
    const db = await seed();
    const pro = new ProService(db, new RolesService(db), { subscriptionsEnabled: false, clock: new FixedClock(now) });
    expect(await pro.isProUser("free")).toBe(true);
    expect([...(await pro.filterPro(["free", "lapsed"]))].sort()).toEqual(["free", "lapsed"]);
  });
});
