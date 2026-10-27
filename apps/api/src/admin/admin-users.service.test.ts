import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { RolesService } from "../users/roles.service.js";
import type { ModerationActionService } from "./moderation-action.service.js";
import { AdminUsersService } from "./admin-users.service.js";

function fakeModeration(): ModerationActionService {
  return { apply: vi.fn(async () => undefined) } as unknown as ModerationActionService;
}

describe("AdminUsersService.deleteUser", () => {
  let db: Db;
  let svc: AdminUsersService;

  beforeEach(async () => {
    db = freshDb();
    svc = new AdminUsersService(db, fakeModeration(), new RolesService(db));
    await insertUsers(db, ["owner", "admin", "plain", "neighbor"]);
    await db.update(schema.user).set({ email: "ilan.daniele@gmail.com", emailVerified: true }).where(eq(schema.user.id, "owner"));
    await db.insert(schema.userRoles).values([{ userId: "owner", role: "ADMIN" }, { userId: "admin", role: "ADMIN" }]);
  });

  it("deletes exactly the confirmed account, credentials and sessions with a PII-free audit", async () => {
    await db.insert(schema.session).values({ id: "test-session", userId: "plain", token: "test-token", expiresAt: new Date(Date.now() + 60000) });
    await db.insert(schema.account).values({ id: "test-account", userId: "plain", accountId: "plain", providerId: "credential" });
    await svc.deleteUser("owner", "plain", "PLAIN@example.test");
    expect(await db.select().from(schema.user).where(eq(schema.user.id, "plain"))).toEqual([]);
    expect(await db.select().from(schema.user).where(eq(schema.user.id, "neighbor"))).toHaveLength(1);
    expect(await db.select().from(schema.session)).toEqual([]);
    expect(await db.select().from(schema.account)).toEqual([]);
    const [audit] = await db.select().from(schema.moderationActions);
    expect(audit).toMatchObject({ actorId: "owner", targetUserId: null, action: "OWNER_ACCOUNT_DELETED", metadata: { emailVerified: false } });
    expect(JSON.stringify(audit)).not.toContain("plain");
  });

  it("rejects other admins, self deletion and an unverified owner", async () => {
    await expect(svc.deleteUser("admin", "plain", "plain@example.test")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.deleteUser("owner", "owner", "ilan.daniele@gmail.com")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, "owner"));
    await expect(svc.deleteUser("owner", "plain", "plain@example.test")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(schema.user)).toHaveLength(4);
  });

  it("rejects stale confirmations, missing targets, staff and shielded accounts without an audit", async () => {
    await expect(svc.deleteUser("owner", "plain", "neighbor@example.test")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(svc.deleteUser("owner", "missing", "missing@example.test")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.deleteUser("owner", "admin", "admin@example.test")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.insert(schema.userRoles).values({ userId: "plain", role: "MODERATOR" });
    await expect(svc.deleteUser("owner", "plain", "plain@example.test")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, "plain"));
    await db.insert(schema.userShields).values({ userId: "plain", createdBy: "owner" });
    await expect(svc.deleteUser("owner", "plain", "plain@example.test")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(schema.moderationActions)).toEqual([]);
  });

  it("keeps billing history and live seats intact", async () => {
    await db.insert(schema.userSubscriptions).values({ userId: "plain", providerSubscriptionId: "test-sub", status: "cancelled" });
    await expect(svc.deleteUser("owner", "plain", "plain@example.test")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await db.delete(schema.userSubscriptions);
    await db.insert(schema.gardenOrders).values({ id: "test-order", userId: "plain", seeds: 100, priceArs: 5000, createdAt: new Date() });
    await expect(svc.deleteUser("owner", "plain", "plain@example.test")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await db.delete(schema.gardenOrders);
    const room = await getRoom(db); const [seat] = await getSeats(db);
    await db.insert(schema.checkIns).values({ userId: "plain", roomId: room.id, seatId: seat!.id, expiresAt: new Date(Date.now() + 60000) });
    await expect(svc.deleteUser("owner", "plain", "plain@example.test")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await db.select().from(schema.checkIns)).toHaveLength(1);
    expect(await db.select().from(schema.user).where(eq(schema.user.id, "plain"))).toHaveLength(1);
    expect(await db.select().from(schema.moderationActions)).toEqual([]);
  });

  it("rolls back the audit if deletion fails", async () => {
    const { sql } = await import("drizzle-orm");
    db.run(sql`CREATE TRIGGER fail_delete BEFORE DELETE ON user BEGIN SELECT RAISE(ABORT, 'test rollback'); END`);
    await expect(svc.deleteUser("owner", "plain", "plain@example.test")).rejects.toThrow();
    expect(await db.select().from(schema.user).where(eq(schema.user.id, "plain"))).toHaveLength(1);
    expect(await db.select().from(schema.moderationActions)).toEqual([]);
  });
});

describe("AdminUsersService.applyAction", () => {
  let db: Db;
  let roles: RolesService;
  let moderation: ModerationActionService;
  let svc: AdminUsersService;

  beforeEach(async () => {
    db = freshDb();
    roles = new RolesService(db);
    moderation = fakeModeration();
    svc = new AdminUsersService(db, moderation, roles);
    await insertUsers(db, ["admin", "moderator", "otherMod", "plain"]);
    await db.insert(schema.userRoles).values([
      { userId: "admin", role: "ADMIN" },
      { userId: "moderator", role: "MODERATOR" },
      { userId: "otherMod", role: "MODERATOR" },
    ]);
  });

  it("rejects a moderation action targeting yourself", async () => {
    await expect(svc.applyAction("admin", "admin", { type: "WARN", reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a moderation action targeting a moderator or admin", async () => {
    await expect(svc.applyAction("admin", "otherMod", { type: "WARN", reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects SUSPEND/BAN/LIFT from a non-admin (moderator) actor", async () => {
    await expect(svc.applyAction("moderator", "plain", { type: "SUSPEND", reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.applyAction("moderator", "plain", { type: "BAN", reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.applyAction("moderator", "plain", { type: "LIFT", reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows WARN/MUTE_CHAT/RESTRICT_OBSERVATIONS from a moderator", async () => {
    await expect(svc.applyAction("moderator", "plain", { type: "WARN", reason: "x" })).resolves.toBeUndefined();
    expect(moderation.apply).toHaveBeenCalledWith({ actorId: "moderator", targetUserId: "plain", type: "WARN", reason: "x" });
  });

  it("allows SUSPEND/BAN/LIFT from an admin", async () => {
    await expect(svc.applyAction("admin", "plain", { type: "SUSPEND", reason: "x" })).resolves.toBeUndefined();
  });
});

describe("AdminUsersService.search", () => {
  let db: Db;
  let svc: AdminUsersService;

  beforeEach(async () => {
    db = freshDb();
    svc = new AdminUsersService(db, fakeModeration(), new RolesService(db));
    await insertUsers(db, ["plain"]);
  });

  it("treats `%` and `_` in the query as literal characters, not wildcards", async () => {
    const results = await svc.search("%", "plain");
    expect(results).toEqual([]);
  });

  it("lists all users when the query is empty or whitespace-only", async () => {
    expect(await svc.search(undefined, "plain")).toHaveLength(1);
    expect(await svc.search("   ", "plain")).toHaveLength(1);
  });

  it("caps the query length at 100 characters", async () => {
    const results = await svc.search("a".repeat(500), "plain");
    expect(results).toEqual([]);
  });
});

describe("AdminUsersService email visibility", () => {
  let db: Db;
  let svc: AdminUsersService;

  beforeEach(async () => {
    db = freshDb();
    svc = new AdminUsersService(db, fakeModeration(), new RolesService(db));
    await insertUsers(db, ["admin", "moderator", "plain"]);
    await db.insert(schema.userRoles).values([
      { userId: "admin", role: "ADMIN" },
      { userId: "moderator", role: "MODERATOR" },
    ]);
  });

  it("returns emails to an ADMIN in search and getById", async () => {
    const results = await svc.search("plain", "admin");
    expect(results).toHaveLength(1);
    expect(results[0]!.email).toEqual(expect.any(String));
    expect((await svc.getById("plain", "admin")).email).toEqual(expect.any(String));
  });

  it("hides emails from a MODERATOR in search and getById", async () => {
    const results = await svc.search("plain", "moderator");
    expect(results).toHaveLength(1);
    expect(results[0]!.email).toBeNull();
    expect((await svc.getById("plain", "moderator")).email).toBeNull();
  });

  it("flags admins in the list", async () => {
    const results = await svc.search(undefined, "admin");
    const byId = Object.fromEntries(results.map((r) => [r.userId, r.isAdmin]));
    expect(byId).toEqual({ admin: true, moderator: false, plain: false });
  });
});

describe("AdminUsersService.setAdmin", () => {
  let db: Db;
  let roles: RolesService;
  let svc: AdminUsersService;

  beforeEach(async () => {
    db = freshDb();
    roles = new RolesService(db);
    svc = new AdminUsersService(db, fakeModeration(), roles);
    await insertUsers(db, ["owner", "admin", "plain"]);
    await db.update(schema.user).set({ email: "Ilan.Daniele@Gmail.com", emailVerified: true }).where(eq(schema.user.id, "owner"));
    await db.insert(schema.userRoles).values([
      { userId: "owner", role: "ADMIN" },
      { userId: "admin", role: "ADMIN" },
    ]);
  });

  it("isOwner matches the owner email case-insensitively and requires a verified email", async () => {
    expect(await roles.isOwner("owner")).toBe(true);
    expect(await roles.isOwner("plain")).toBe(false);
    await db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, "owner"));
    expect(await roles.isOwner("owner")).toBe(false);
  });

  it("lets the owner grant ADMIN and records an audit entry", async () => {
    await svc.setAdmin("owner", "plain", true);
    expect(await roles.rolesFor("plain")).toEqual(["ADMIN"]);
    const audit = await db.select().from(schema.moderationActions);
    expect(audit).toMatchObject([{ actorId: "owner", targetUserId: "plain", action: "ADMIN_GRANTED" }]);
  });

  it("lets the owner revoke ADMIN", async () => {
    await svc.setAdmin("owner", "admin", false);
    expect(await roles.rolesFor("admin")).toEqual([]);
  });

  it("rejects a non-owner ADMIN", async () => {
    await expect(svc.setAdmin("admin", "plain", true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.setAdmin("admin", "owner", false)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an owner whose email is unverified", async () => {
    await db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, "owner"));
    await expect(svc.setAdmin("owner", "plain", true)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects the owner changing their own role", async () => {
    await expect(svc.setAdmin("owner", "owner", false)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns not found for a missing target", async () => {
    await expect(svc.setAdmin("owner", "ghost", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("AdminUsersService shields", () => {
  let db: Db;
  let roles: RolesService;
  let svc: AdminUsersService;

  beforeEach(async () => {
    db = freshDb();
    roles = new RolesService(db);
    svc = new AdminUsersService(db, fakeModeration(), roles);
    await insertUsers(db, ["owner", "admin", "plain"]);
    await db.update(schema.user).set({ email: "ilan.daniele@gmail.com", emailVerified: true }).where(eq(schema.user.id, "owner"));
    await db.insert(schema.userRoles).values([
      { userId: "owner", role: "ADMIN" },
      { userId: "admin", role: "ADMIN" },
    ]);
  });

  it("only the owner can shield and unshield, and both are audited", async () => {
    await expect(svc.setShield("admin", "plain", true)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await svc.setShield("owner", "plain", true);
    expect((await svc.getById("plain", "owner")).shielded).toBe(true);
    await expect(svc.setShield("admin", "plain", false)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await svc.setShield("owner", "plain", false);
    expect((await svc.getById("plain", "owner")).shielded).toBe(false);
    const audit = await db.select().from(schema.moderationActions);
    expect(audit.map((a) => a.action).sort()).toEqual(["SHIELDED", "UNSHIELDED"]);
  });

  it("an admin cannot ban, suspend, mute or restrict a shielded user; the owner can", async () => {
    await svc.setShield("owner", "plain", true);
    for (const type of ["BAN", "SUSPEND", "MUTE_CHAT", "RESTRICT_OBSERVATIONS"] as const) {
      await expect(svc.applyAction("admin", "plain", { type, reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(svc.applyAction("admin", "plain", { type: "WARN", reason: "x" })).resolves.toBeUndefined();
    await expect(svc.applyAction("admin", "plain", { type: "LIFT", reason: "x" })).resolves.toBeUndefined();
    await expect(svc.applyAction("owner", "plain", { type: "BAN", reason: "x" })).resolves.toBeUndefined();
  });
});
