import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import { COLLABORATION_REWARD_PLACES as TARGET, COLLABORATION_REWARD_SEEDS as BONUS, type AchievementsDto, type MeDto } from "@sala/contracts";
import type { Auth } from "../auth/auth.instance.js";
import { createApp } from "../http/app.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { getRoom, getSeats, insertUsers } from "../test-utils.js";
import { FixedClock } from "../platform/clock.js";
import { ProService } from "../subscriptions/pro.js";

const WEEK = 7 * 86400_000;
describe("weekly collaboration rewards", () => {
  let fixture: ReturnType<typeof buildTestApp>;
  let app: ReturnType<typeof createApp>;
  let clock: FixedClock;
  let actor: string | null;
  let room: Awaited<ReturnType<typeof getRoom>>;
  let seats: Awaited<ReturnType<typeof getSeats>>;
  beforeEach(async () => {
    fixture = buildTestApp(); clock = fixture.services.clock as FixedClock;
    clock.set(new Date("2026-10-27T15:00:00Z"));
    await insertUsers(fixture.db, ["member", "viewer"]);
    fixture.db.update(schema.user).set({ emailVerified: true }).run();
    room = await getRoom(fixture.db); seats = await getSeats(fixture.db);
    fixture.services.pro = new ProService(fixture.db, fixture.services.roles, { subscriptionsEnabled: true, clock });
    actor = "member";
    const auth = { api: { getSession: async () => actor ? { user: { id: actor, email: `${actor}@example.test`, emailVerified: true } } : null } } as unknown as Auth;
    app = createApp({ services: fixture.services, auth });
  });
  function record(n: number, now = clock.now()) {
    for (let i = 0; i < n; i++) fixture.db.transaction(tx => fixture.services.collaboration.record(tx, "member", room.id, seats[i]!.id, room.timezone, now));
  }
  const receipts = () => fixture.db.select().from(schema.collaborationRewards).all();
  const call = (path: string, method = "GET", body?: unknown) => app.request(`/api/v1${path}`, { method, headers: baseHeaders({ "content-type": "application/json" }), ...(body ? { body: JSON.stringify(body) } : {}) });

  it("awards exactly at the goal, unlocking server-side Pro and ad-free access without a subscription or role", async () => {
    record(TARGET - 1);
    expect(receipts()).toHaveLength(0);
    expect((await call("/me/study-history")).status).toBe(403);
    record(TARGET);
    expect(receipts()).toMatchObject([{ seeds: BONUS, places: TARGET, earnedAt: clock.now(), proExpiresAt: new Date(+clock.now() + WEEK) }]);
    expect((await fixture.services.garden.get("member")).seeds).toBe(30 + Math.floor(TARGET / 10) + BONUS);
    expect((await call("/me/study-history")).status).toBe(200);
    const me = await (await call("/me")).json() as MeDto;
    expect(me).toMatchObject({ adFree: true, pro: true, proGiftExpiresAt: new Date(+clock.now() + WEEK).toISOString(), roles: [] });
    expect(fixture.db.select().from(schema.userSubscriptions).all()).toHaveLength(0);
    expect(await fixture.services.pro.badgeIds(["member", "viewer"])).toEqual(new Set(["member"]));
  });

  it("never duplicates the reward for repeated seats, state toggles, reads or additional seats that day", async () => {
    record(TARGET); record(100); record(100);
    for (let i = 0; i < 3; i++) await call("/me/achievements");
    expect(receipts()).toHaveLength(1);
    expect((await fixture.services.garden.get("member")).seeds).toBe(40 + BONUS);
    expect(fixture.services.collaboration.progress("member")).toMatchObject({ places: 100, weeklyReward: { nextEligibleAt: new Date(+clock.now() + WEEK).toISOString() } });
  });

  it("does not reach the goal through an HTTP report with no verified presence", async () => {
    record(TARGET - 1);
    const response = await call("/observations", "POST", { roomId: room.id, seatId: seats[TARGET - 1]!.id, status: "FREE" });
    expect(response.status).toBe(428);
    expect(await response.json()).toMatchObject({ error: { code: "PRESENCE_REQUIRED" } });
    expect(receipts()).toHaveLength(0);
    expect(fixture.services.collaboration.progress("member").places).toBe(TARGET - 1);
  });

  it("rolls back counter, seed credit and promotional access together", async () => {
    record(TARGET - 1);
    expect(() => fixture.db.transaction(tx => {
      fixture.services.collaboration.record(tx, "member", room.id, seats[TARGET - 1]!.id, room.timezone, clock.now());
      throw new Error("Rollback synthetic write");
    })).toThrow("Rollback synthetic write");
    expect(receipts()).toHaveLength(0);
    expect(fixture.services.collaboration.progress("member").places).toBe(TARGET - 1);
    expect(await fixture.services.pro.isProUser("member")).toBe(false);
    expect((await fixture.services.garden.get("member")).seeds).toBe(30 + Math.floor((TARGET - 1) / 10));
    record(TARGET); expect(receipts()).toHaveLength(1);
  });

  it("requires distinct seats in one Buenos Aires day", () => {
    clock.set(new Date("2026-10-27T02:59:00Z")); record(TARGET - 1);
    clock.advance(120_000); record(1);
    expect(receipts()).toHaveLength(0);
    expect(fixture.services.collaboration.progress("member")).toMatchObject({ places: TARGET, todayPlaces: 1, days: 2 });
  });

  it("uses a rolling seven-day cooldown and awards again exactly at its end", () => {
    record(TARGET); const earned = +clock.now();
    clock.advance(86400_000); record(TARGET); expect(receipts()).toHaveLength(1);
    clock.set(new Date(earned + WEEK - 60_000)); record(TARGET - 1); expect(receipts()).toHaveLength(1);
    clock.advance(60_000); record(TARGET);
    expect(receipts()).toHaveLength(2);
    expect(receipts().map(r => +r.proExpiresAt).sort()).toEqual([earned + WEEK, earned + 2 * WEEK]);
  });

  it("requires a verified email and never grants prizes just by reading previous activity", async () => {
    fixture.db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, "member")).run();
    record(TARGET); expect(receipts()).toHaveLength(0);
    fixture.db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, "member")).run();
    await call("/me/achievements"); expect(receipts()).toHaveLength(0);
    record(TARGET); expect(receipts()).toHaveLength(0); // same places still cannot count again
    record(TARGET + 1); expect(receipts()).toHaveLength(1);
  });

  it("expires the free access precisely, retaining seeds and receipt after audit cleanup", async () => {
    record(TARGET); const balance = (await fixture.services.garden.get("member")).seeds;
    fixture.db.delete(schema.moderationActions).run(); record(TARGET);
    expect(receipts()).toHaveLength(1);
    clock.advance(WEEK - 1); expect(await fixture.services.pro.isProUser("member")).toBe(true);
    clock.advance(1); expect(await fixture.services.pro.isProUser("member")).toBe(false);
    expect((await call("/me/study-history")).status).toBe(403);
    expect(await (await call("/me")).json()).toMatchObject({ adFree: false, proGiftExpiresAt: null });
    expect((await fixture.services.garden.get("member")).seeds).toBe(balance);
    expect(fixture.services.collaboration.pendingRewards("member")).toEqual([]);
  });

  it("does not overwrite, cancel, extend or create provider billing state", async () => {
    fixture.db.insert(schema.userSubscriptions).values({ userId: "member", providerSubscriptionId: "synthetic-recurring", status: "authorized", currentPeriodEnd: new Date(+clock.now() + 30 * 86400_000) }).run();
    const before = fixture.db.select().from(schema.userSubscriptions).all();
    record(TARGET); clock.advance(WEEK);
    expect(await fixture.services.pro.isProUser("member")).toBe(true);
    expect(fixture.db.select().from(schema.userSubscriptions).all()).toEqual(before);
  });

  it("keeps notices private and acknowledges only the current account, without accepting extra credit", async () => {
    record(TARGET);
    const own = await (await call("/me/achievements")).json() as AchievementsDto;
    expect(own.rewards).toHaveLength(1); const id = own.rewards![0]!.id;
    actor = "viewer";
    expect((await (await call("/me/achievements")).json() as AchievementsDto).rewards).toEqual([]);
    expect((await call(`/me/collaboration-rewards/${id}/seen`, "POST")).status).toBe(404);
    expect(await (await call("/profiles/member/achievements")).json()).not.toHaveProperty("rewards");
    actor = null; expect((await call(`/me/collaboration-rewards/${id}/seen`, "POST")).status).toBe(401);
    actor = "member"; const before = (await fixture.services.garden.get("member")).seeds;
    expect((await call(`/me/collaboration-rewards/${id}/seen`, "POST", { seeds: 99999, userId: "viewer" })).status).toBe(200);
    expect((await call(`/me/collaboration-rewards/${id}/seen`, "POST")).status).toBe(200);
    expect((await fixture.services.garden.get("member")).seeds).toBe(before);
    expect((await (await call("/me/achievements")).json() as AchievementsDto).rewards).toEqual([]);
    expect(await fixture.services.pro.isProUser("member")).toBe(true);
  });

  it("deletes reward history with its account", () => {
    record(TARGET); fixture.db.delete(schema.user).where(eq(schema.user.id, "member")).run();
    expect(receipts()).toEqual([]);
  });
});
