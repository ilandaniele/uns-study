import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import type { AchievementsDto, AliasProfileDto } from "@sala/contracts";
import type { Auth } from "../auth/auth.instance.js";
import { createApp } from "../http/app.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { env } from "../env.js";
import { getRoom, getSeats, insertUsers } from "../test-utils.js";
import { FixedClock } from "../platform/clock.js";

describe("community achievements, rewards and approved staff applications", () => {
  let fixture: ReturnType<typeof buildTestApp>;
  let app: ReturnType<typeof createApp>;
  let actor: string | null;
  let ownerEmail: string;
  let room: Awaited<ReturnType<typeof getRoom>>;
  let seats: Awaited<ReturnType<typeof getSeats>>;
  let clock: FixedClock;

  beforeEach(async () => {
    ownerEmail = env.ownerEmail; env.ownerEmail = "owner@example.test";
    fixture = buildTestApp();
    await insertUsers(fixture.db, ["owner", "admin", "member", "viewer"]);
    fixture.db.update(schema.user).set({ emailVerified: true }).run();
    fixture.db.insert(schema.userRoles).values([{ userId: "owner", role: "ADMIN" }, { userId: "admin", role: "ADMIN" }]).run();
    fixture.db.insert(schema.userProfiles).values({ userId: "member", firstName: "Nombre privado", nickname: "Apodo privado", identityMode: "HIDDEN", alias: "Coipo Ingenioso", aliasLower: "coipo ingenioso", aliasAnimal: "coipo", instagram: "privado", studentNumber: "privado" }).run();
    fixture.db.insert(schema.userPrivacySettings).values({ userId: "member", showFullName: true, showAvatar: true, showInRoom: true, showAdminBadge: true }).run();
    room = await getRoom(fixture.db); seats = await getSeats(fixture.db);
    clock = fixture.services.clock as FixedClock; clock.set(new Date("2026-10-27T15:00:00Z"));
    actor = "member";
    const auth = { api: { getSession: async () => actor ? { user: { id: actor, name: actor, email: `${actor}@example.test`, emailVerified: true } } : null } } as unknown as Auth;
    app = createApp({ services: fixture.services, auth });
  });
  afterEach(() => { env.ownerEmail = ownerEmail; vi.restoreAllMocks(); });

  function call(path: string, method = "GET", body?: unknown) {
    return app.request(`/api/v1${path}`, { method, headers: baseHeaders({ "content-type": "application/json" }), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  function record(n: number, userId = "member", now = clock.now()) {
    for (let i = 0; i < n; i++) fixture.db.transaction(tx => fixture.services.collaboration.record(tx, userId, room.id, seats[i % seats.length]!.id, room.timezone, now));
  }
  function qualify() {
    record(40, "member", new Date("2026-10-25T15:00:00Z"));
    record(40, "member", new Date("2026-10-26T15:00:00Z"));
    record(20);
  }

  it("credits each seat only once per local day, starts rewards at ten and caps daily credit", async () => {
    record(9);
    expect((await fixture.services.garden.get("member")).seeds).toBe(30);
    record(10);
    expect((await fixture.services.garden.get("member")).seeds).toBe(31);
    record(10); // duplicate reports and changing status cannot farm seeds
    expect(fixture.services.collaboration.progress("member")).toMatchObject({ places: 10, seeds: 1, nextSeedPlaces: 10 });
    record(108);
    expect(fixture.services.collaboration.progress("member")).toMatchObject({ places: 100, seeds: 10, nextSeedPlaces: 0 });
    expect((await fixture.services.garden.get("member")).seeds).toBe(70); // starter + daily seeds + weekly bonus
  });

  it("uses Buenos Aires midnight and keeps earned seeds through spending and report expiry", async () => {
    clock.set(new Date("2026-10-27T02:59:00Z")); record(10);
    clock.advance(2 * 60_000); record(10);
    expect(fixture.services.collaboration.progress("member")).toMatchObject({ places: 20, days: 2, seeds: 2, todayPlaces: 10 });
    const planted = await fixture.services.garden.plant("member", { plot: 0, speciesId: "espinillo" });
    expect(planted.seeds).toBe(20);
    fixture.db.delete(schema.seatObservations).run();
    expect((await fixture.services.garden.get("member")).seeds).toBe(20);
    expect((await fixture.services.garden.get("viewer")).seeds).toBe(30);
  });

  it("records successful individual reports, but not failed presence, own seats or mass admin operations", async () => {
    const input = { userId: "member", roomId: room.id, seatId: seats[0]!.id, status: "OCCUPIED" as const };
    await expect(fixture.services.observations.observe(input)).rejects.toMatchObject({ code: "PRESENCE_REQUIRED" });
    expect(fixture.services.collaboration.progress("member").places).toBe(0);
    const presence = { roomId: room.id, expiresAt: new Date(Date.now() + 60_000) };
    await fixture.services.observations.observe({ ...input, presence });
    await fixture.services.observations.observe({ ...input, presence });
    expect(fixture.services.collaboration.progress("member").places).toBe(1);
    fixture.db.insert(schema.checkIns).values({ userId: "member", roomId: room.id, seatId: seats[1]!.id, expiresAt: new Date(Date.now() + 60_000) }).run();
    await expect(fixture.services.observations.observe({ ...input, seatId: seats[1]!.id, presence })).rejects.toMatchObject({ code: "OWN_SEAT_OBSERVATION" });
    await fixture.services.adminRooms.markAllOccupied(room.id, "admin", 60);
    expect(fixture.services.collaboration.progress("admin").places).toBe(0);
    expect(fixture.services.collaboration.progress("member").places).toBe(1);
  });

  it("persists earned medals once, acknowledges only the current user's awards and grants no role", async () => {
    qualify();
    const first = await (await call("/me/achievements")).json() as AchievementsDto;
    expect(first.badges).toHaveLength(12);
    expect(first.unseenIds).toEqual(expect.arrayContaining(["collaboration_10", "collaboration_50", "collaboration_100"]));
    const earnedAt = first.badges.find(b => b.id === "collaboration_100")!.earnedAt;
    clock.advance(60_000);
    await call("/me/achievements");
    expect(fixture.db.select().from(schema.userAchievements).all()).toHaveLength(3);
    expect(await fixture.services.roles.rolesFor("member")).toEqual([]);
    expect((await call("/me/achievements/seen", "POST", { ids: ["collaboration_100"], userId: "viewer" })).status).toBe(400);
    expect((await call("/me/achievements/seen", "POST", { ids: ["collaboration_100"] })).status).toBe(200);
    fixture.db.delete(schema.collaborationUpdates).run();
    const again = await fixture.services.achievements.get("member");
    expect(again.unseenIds).not.toContain("collaboration_100");
    expect(again.badges.find(b => b.id === "collaboration_100")).toMatchObject({ earned: true, earnedAt });
  });

  it("requires sustained participation and explicit owner approval, atomically and idempotently", async () => {
    record(100);
    expect((await call("/me/admin-application", "POST")).status).toBe(400); // one busy day never grants staff
    record(1, "member", new Date("2026-10-25T15:00:00Z")); record(1, "member", new Date("2026-10-26T15:00:00Z"));
    expect((await call("/me/admin-application", "POST")).status).toBe(201);
    expect((await call("/me/admin-application", "POST")).status).toBe(201);
    expect(await fixture.services.roles.rolesFor("member")).toEqual([]);
    actor = "admin";
    expect((await call("/admin/admin-applications")).status).toBe(403);
    expect((await call("/admin/admin-applications/member/review", "POST", { approve: true })).status).toBe(403);
    actor = "owner";
    expect(await (await call("/admin/admin-applications/count")).json()).toEqual({ count: 1 });
    expect((await call("/admin/admin-applications/member/review", "POST", { approve: true })).status).toBe(200);
    expect((await call("/admin/admin-applications/member/review", "POST", { approve: true })).status).toBe(200);
    expect(await fixture.services.roles.rolesFor("member")).toEqual(["ADMIN"]);
    expect(fixture.db.select().from(schema.moderationActions).all()).toHaveLength(1);
    expect(fixture.db.select().from(schema.adminApplications).get()?.status).toBe("APPROVED");
  });

  it("prevents immediate reapplications, spam eligibility and approval of unverified accounts", async () => {
    qualify(); await call("/me/admin-application", "POST"); actor = "owner";
    fixture.db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, "member")).run();
    expect((await call("/admin/admin-applications/member/review", "POST", { approve: true })).status).toBe(400);
    expect(await fixture.services.roles.rolesFor("member")).toEqual([]);
    await call("/admin/admin-applications/member/review", "POST", { approve: false });
    actor = "member";
    expect((await call("/me/admin-application", "POST")).status).toBe(400);
    clock.advance(8 * 86400_000);
    fixture.db.insert(schema.userReputation).values({ userId: "member", spamScore: 5 }).run();
    expect(fixture.services.collaboration.progress("member").eligibleForAdmin).toBe(false);
  });

  it("opens an alias profile with activity and garden while never linking the hidden account", async () => {
    qualify(); actor = "viewer";
    const response = await call("/aliases/Coipo%20Ingenioso/profile");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const profile = await response.json() as AliasProfileDto;
    expect(profile.alias).toBe("Coipo Ingenioso");
    expect(profile.stats?.places).toBe(100);
    expect(profile.badges).toHaveLength(3);
    expect(profile.garden).toMatchObject({ plants: [], collection: {}, plotCount:25 });
    const json = JSON.stringify(profile);
    for (const forbidden of ["member", "example.test", "Nombre privado", "Apodo privado", "instagram", "studentNumber", "SUPERADMIN", "userId"]) expect(json).not.toContain(forbidden);
    fixture.db.update(schema.userProfiles).set({ identityMode: "NICKNAME" }).where(eq(schema.userProfiles.userId, "member")).run();
    expect((await call("/aliases/Coipo%20Ingenioso/profile")).status).toBe(404);
    actor = null; expect((await call("/aliases/Coipo%20Ingenioso/profile")).status).toBe(401);
  });

  it("keeps full alias-account lookup in a separate, audited SUPERADMIN-only endpoint", async () => {
    actor = "viewer";
    expect((await call("/admin/aliases/Coipo%20Ingenioso/profile")).status).toBe(403);
    actor = "admin";
    expect((await call("/admin/aliases/Coipo%20Ingenioso/profile")).status).toBe(403);
    actor = "owner";
    const response = await call("/admin/aliases/Coipo%20Ingenioso/profile");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ userId: "member", profile: { firstName: "Nombre privado" } });
    expect(fixture.db.select().from(schema.moderationActions).all().some(action => action.action === "ADMIN_PROFILE_VIEWED")).toBe(true);
  });

  it("respects activity opt-out and both blocking directions, including changes during awaited reads", async () => {
    qualify(); actor = "viewer";
    fixture.db.update(schema.userPrivacySettings).set({ showInRanking: false }).where(eq(schema.userPrivacySettings.userId, "member")).run();
    const hidden = await (await call("/aliases/Coipo%20Ingenioso/profile")).json() as AliasProfileDto;
    expect(hidden.stats).toBeNull(); expect(hidden.badges).toEqual([]);
    fixture.db.update(schema.userPrivacySettings).set({ showInRanking: true }).where(eq(schema.userPrivacySettings.userId, "member")).run();
    const original = fixture.services.streakBadges.badgeSummary.bind(fixture.services.streakBadges);
    vi.spyOn(fixture.services.streakBadges, "badgeSummary").mockImplementationOnce(async id => {
      const data = await original(id);
      fixture.db.insert(schema.userBlocks).values({ blockerId: "member", blockedId: "viewer" }).run();
      return data;
    });
    expect((await call("/aliases/Coipo%20Ingenioso/profile")).status).toBe(404);
    fixture.db.delete(schema.userBlocks).run();
    fixture.db.insert(schema.userBlocks).values({ blockerId: "viewer", blockedId: "member" }).run();
    expect((await call("/profiles/member/achievements")).status).toBe(404);
  });

  it("rechecks alias visibility after the garden read and does not expose Pro streak details", async () => {
    qualify(); actor = "viewer";
    expect((await fixture.services.achievements.get("member")).stats).not.toHaveProperty("longestStreak");
    const visit = fixture.services.garden.visit.bind(fixture.services.garden);
    vi.spyOn(fixture.services.garden, "visit").mockImplementationOnce(async (viewer, target) => {
      const garden = await visit(viewer, target);
      fixture.db.update(schema.userPrivacySettings).set({ showInRanking: false, showAliasAnimalOnMap: false }).where(eq(schema.userPrivacySettings.userId, target)).run();
      return garden;
    });
    const data = await (await call("/aliases/Coipo%20Ingenioso/profile")).json() as AliasProfileDto;
    expect(data.stats).toBeNull(); expect(data.badges).toEqual([]); expect(data.aliasAnimal).toBeNull();
  });
});
