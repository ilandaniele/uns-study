import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { RolesService } from "../users/roles.service.js";
import type { ModerationActionService } from "./moderation-action.service.js";
import { AdminUsersService } from "./admin-users.service.js";

function fakeModeration(): ModerationActionService {
  return { apply: vi.fn(async () => undefined) } as unknown as ModerationActionService;
}

describe("AdminUsersService.applyAction", () => {
  let db: Db;
  let roles: RolesService;
  let moderation: ModerationActionService;
  let svc: AdminUsersService;

  beforeEach(async () => {
    db = await freshDb();
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
    db = await freshDb();
    svc = new AdminUsersService(db, fakeModeration(), new RolesService(db));
    await insertUsers(db, ["plain"]);
  });

  it("treats `%` and `_` in the query as literal characters, not wildcards", async () => {
    const results = await svc.search("%", "plain");
    expect(results).toEqual([]);
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
    db = await freshDb();
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
});
