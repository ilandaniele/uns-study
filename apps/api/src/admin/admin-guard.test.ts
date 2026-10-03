import { beforeEach, describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { RolesService } from "../users/roles.service.js";
import { AdminGuard } from "../users/admin.guard.js";

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

  beforeEach(async () => {
    db = await freshDb();
    roles = new RolesService(db);
    await insertUsers(db, ["plain", "admin"]);
    await db.insert(schema.userRoles).values({ userId: "admin", role: "ADMIN" });
  });

  it("rejects an unauthenticated request", async () => {
    const guard = new AdminGuard(fakeAuth(null), roles);
    await expect(guard.canActivate(contextFor({}))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects an authenticated non-admin user with 403 FORBIDDEN", async () => {
    const guard = new AdminGuard(fakeAuth({ user: { id: "plain", name: "plain", email: "plain@example.test", image: null } }), roles);
    await expect(guard.canActivate(contextFor({}))).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("allows an ADMIN user through", async () => {
    const guard = new AdminGuard(fakeAuth({ user: { id: "admin", name: "admin", email: "admin@example.test", image: null } }), roles);
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
  });
});
