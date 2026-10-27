import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import type { MeDto, PublicProfileDto } from "@sala/contracts";
import type { Auth } from "../auth/auth.instance.js";
import { env } from "../env.js";
import { createApp } from "../http/app.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { countQueries, getRoom, getSeats, insertUsers } from "../test-utils.js";

describe("superadmin identity, permissions and public badges", () => {
  let fixture: ReturnType<typeof buildTestApp>;
  let app: ReturnType<typeof createApp>;
  let actor: string | null;
  let savedOwner: string;
  const credit = { userId: "plain", startedAt: "2026-01-15T12:00:00.000Z", minutes: 60, reason: "Test correction" };

  beforeEach(async () => {
    savedOwner = env.ownerEmail;
    env.ownerEmail = "owner@example.test";
    fixture = buildTestApp();
    await insertUsers(fixture.db, ["owner", "admin", "moderator", "plain", "fake"]);
    await fixture.db.update(schema.user).set({ emailVerified: true });
    await fixture.db.update(schema.user).set({ email: "Owner@Example.Test" }).where(eq(schema.user.id, "owner"));
    await fixture.db.update(schema.user).set({ name: "Ilan Daniele" }).where(eq(schema.user.id, "fake"));
    await fixture.db.insert(schema.userRoles).values([
      { userId: "owner", role: "ADMIN" }, { userId: "admin", role: "ADMIN" },
      { userId: "fake", role: "ADMIN" }, { userId: "moderator", role: "MODERATOR" },
    ]);
    await fixture.db.insert(schema.userProfiles).values(["owner", "admin", "fake", "plain"].map(userId => ({ userId, nickname: userId, identityMode: "NICKNAME" as const })));
    await fixture.db.insert(schema.userPrivacySettings).values(["owner", "admin", "fake", "plain"].map(userId => ({ userId, showInRoom: true, showAdminBadge: true })));
    actor = "owner";
    const auth = { api: { getSession: async () => actor ? { user: { id: actor, name: actor, email: `${actor}@example.test`, emailVerified: true } } : null } } as unknown as Auth;
    app = createApp({ services: fixture.services, auth });
  });
  afterEach(() => { env.ownerEmail = savedOwner; });

  function post(body: unknown = credit) {
    return app.request("/api/v1/admin/study-sessions", { method: "POST", headers: baseHeaders({ "content-type": "application/json" }), body: JSON.stringify(body) });
  }
  async function me() { return await (await app.request("/api/v1/me", { headers: baseHeaders() })).json() as MeDto; }

  it("exposes the study-time capability only for the superadmin, independently of normal ADMIN", async () => {
    expect(await me()).toMatchObject({ isSuperAdmin: true, canManageStudyTime: true });
    for (const id of ["admin", "fake", "moderator", "plain"]) {
      actor = id;
      expect(await me()).toMatchObject({ isSuperAdmin: false, canManageStudyTime: false });
    }
    actor = null;
    expect(await me()).toMatchObject({ isSuperAdmin: false, canManageStudyTime: false });
  });

  it("rejects both addition and subtraction by other admins, including forged flags and malformed data", async () => {
    for (const id of ["admin", "fake"]) {
      actor = id;
      for (const body of [credit, { ...credit, minutes: -15, isSuperAdmin: true, canManageStudyTime: true }, {}]) {
        expect((await post(body)).status).toBe(403);
      }
    }
    expect(await fixture.db.select().from(schema.studySessions)).toEqual([]);
    expect(await fixture.db.select().from(schema.moderationActions)).toEqual([]);
  });

  it("allows the owner to add and subtract time, preserving the audit trail", async () => {
    expect((await post()).status).toBe(201);
    expect((await post({ ...credit, minutes: -15 })).status).toBe(201);
    const sessions = await fixture.db.select().from(schema.studySessions);
    expect(sessions.map(s => s.verifiedMinutes).sort((a, b) => a - b)).toEqual([-15, 60]);
    const audit = await fixture.db.select().from(schema.moderationActions);
    expect(audit).toHaveLength(2);
    expect(audit.every(a => a.actorId === "owner" && a.action === "STUDY_TIME_CREDITED")).toBe(true);
  });

  it("rejects anonymous users, moderators, an unverified owner and an owner without ADMIN", async () => {
    actor = null; expect((await post()).status).toBe(401);
    for (const id of ["moderator", "plain"]) { actor = id; expect((await post()).status).toBe(403); }
    actor = "owner";
    await fixture.db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, "owner"));
    expect((await post()).status).toBe(403);
    await fixture.db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, "owner"));
    await fixture.db.delete(schema.userRoles).where(eq(schema.userRoles.userId, "owner"));
    expect((await post()).status).toBe(403);
    await expect(fixture.services.adminStudySessions.credit("owner", credit)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await fixture.db.select().from(schema.studySessions)).toEqual([]);
  });

  it("blocks a restricted superadmin and removes the UI capability", async () => {
    await fixture.db.insert(schema.userRestrictions).values({ userId: "owner", type: "SUSPENDED", reason: "Test restriction" });
    expect((await post()).status).toBe(403);
    expect(await me()).toMatchObject({ canManageStudyTime: false });
    expect(await fixture.db.select().from(schema.studySessions)).toEqual([]);
  });

  it("does not let another admin create a superadmin through the role-grant endpoint", async () => {
    actor = "admin";
    const response = await app.request("/api/v1/admin/users/plain/admin", { method: "PUT", headers: baseHeaders({ "content-type": "application/json" }), body: JSON.stringify({ role: "SUPERADMIN", isSuperAdmin: true }) });
    expect(response.status).toBe(403);
    expect(await fixture.services.roles.rolesFor("plain")).toEqual([]);
  });

  it("resolves the owner badge in one query, without trusting names or unverified addresses", async () => {
    const { result, queries } = await countQueries(fixture.db, () => fixture.services.roles.adminBadges(["owner", "admin", "fake", "plain"]));
    expect(queries).toBe(1);
    expect(result.get("owner")).toBe("SUPERADMIN");
    expect(result.get("admin")).toBe(true);
    expect(result.get("fake")).toBe(true);
    expect(result.has("plain")).toBe(false);
    await fixture.db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, "owner"));
    expect(await fixture.services.roles.isSuperAdmin("owner")).toBe(false);
    expect((await fixture.services.roles.adminBadges(["owner"])).get("owner")).not.toBe("SUPERADMIN");
  });

  it("propagates the distinct badge through profiles, chat, ranking identities and occupants", async () => {
    actor = "plain";
    const owner = await (await app.request("/api/v1/profiles/owner", { headers: baseHeaders() })).json() as PublicProfileDto;
    const admin = await (await app.request("/api/v1/profiles/admin", { headers: baseHeaders() })).json() as PublicProfileDto;
    expect(owner.adminBadge).toBe("SUPERADMIN");
    expect(admin.adminBadge).toBe(true);
    expect(owner).not.toHaveProperty("email");
    const room = await getRoom(fixture.db); const seats = await getSeats(fixture.db);
    await fixture.db.insert(schema.checkIns).values(["owner", "admin"].map((userId, i) => ({ userId, roomId: room.id, seatId: seats[i]!.id, expiresAt: new Date(Date.now() + 60000) })));
    const people = await fixture.services.roomPeople.listPeople(room.id, "plain");
    expect(people.find(p => p.userId === "owner")?.adminBadge).toBe("SUPERADMIN");
    const occupants = await fixture.services.roomPeople.listOccupants(room.id, "plain");
    expect(occupants.filter(o => "userId" in o && o.userId === "owner")).toMatchObject([{ adminBadge: "SUPERADMIN" }]);
    const chat = await fixture.services.chat.createMessage("owner", room.slug, "Test message");
    expect(chat.author.adminBadge).toBe("SUPERADMIN");
    const identities = await fixture.services.rankings.identities(["owner", "admin"]);
    expect(identities.get("owner")?.adminBadge).toBe("SUPERADMIN");
    expect(identities.get("admin")?.adminBadge).toBe(true);
  });

  it("never reveals the superadmin badge while hidden or when its visibility is disabled", async () => {
    await fixture.db.update(schema.userPrivacySettings).set({ showAdminBadge: false }).where(eq(schema.userPrivacySettings.userId, "owner"));
    expect((await fixture.services.profiles.getPublicProfile("plain", "owner")).adminBadge).toBe(false);
    await fixture.db.update(schema.userPrivacySettings).set({ showAdminBadge: true }).where(eq(schema.userPrivacySettings.userId, "owner"));
    await fixture.db.update(schema.userProfiles).set({ identityMode: "HIDDEN", alias: "Coipo Ingenioso", aliasAnimal: "coipo" }).where(eq(schema.userProfiles.userId, "owner"));
    const hidden = await fixture.services.profiles.getPublicProfile("plain", "owner");
    expect(hidden.adminBadge).toBe(false);
    expect(JSON.stringify(hidden)).not.toContain("SUPERADMIN");
  });
});
