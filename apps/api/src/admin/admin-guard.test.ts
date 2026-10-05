import { beforeEach, describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { RolesService } from "../users/roles.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { AdminGuard, AdminOnlyGuard } from "../users/admin.guard.js";

function contextFor(headers: Record<string, string>): ExecutionContext {
  const req = { headers, user: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function fakeAuth(session: { user: { id: string; name: string; email: string; image: string | null } } | null) {
  return { api: { getSession: async () => session } } as never;
}

describe("AdminGuard", () => {
  let db: Db;
  let roles: RolesService;
  let restrictions: RestrictionService;

  beforeEach(async () => {
    db = await freshDb();
    roles = new RolesService(db);
    restrictions = new RestrictionService(db);
    await insertUsers(db, ["plain", "admin"]);
    await db.insert(schema.userRoles).values({ userId: "admin", role: "ADMIN" });
  });

  it("rejects an unauthenticated request", async () => {
    const guard = new AdminGuard(fakeAuth(null), roles, restrictions);
    await expect(guard.canActivate(contextFor({}))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects an authenticated non-admin user with 403 FORBIDDEN", async () => {
    const guard = new AdminGuard(fakeAuth({ user: { id: "plain", name: "plain", email: "plain@example.test", image: null } }), roles, restrictions);
    await expect(guard.canActivate(contextFor({}))).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("rejects a banned admin with RESTRICTED", async () => {
    await db.insert(schema.userRestrictions).values({ userId: "admin", type: "BANNED", reason: "x" });
    const session = { user: { id: "admin", name: "admin", email: "admin@example.test", image: null } };
    await expect(new AdminGuard(fakeAuth(session), roles, restrictions).canActivate(contextFor({}))).rejects.toMatchObject({ code: "RESTRICTED" });
    await expect(new AdminOnlyGuard(fakeAuth(session), roles, restrictions).canActivate(contextFor({}))).rejects.toMatchObject({ code: "RESTRICTED" });
  });

  it("rejects a suspended admin with RESTRICTED", async () => {
    await db.insert(schema.userRestrictions).values({ userId: "admin", type: "SUSPENDED", reason: "x" });
    const session = { user: { id: "admin", name: "admin", email: "admin@example.test", image: null } };
    await expect(new AdminGuard(fakeAuth(session), roles, restrictions).canActivate(contextFor({}))).rejects.toMatchObject({ code: "RESTRICTED" });
  });

  it("allows an ADMIN user through", async () => {
    const guard = new AdminGuard(fakeAuth({ user: { id: "admin", name: "admin", email: "admin@example.test", image: null } }), roles, restrictions);
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
  });
});
