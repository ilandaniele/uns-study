import { beforeEach, describe, expect, it, vi } from "vitest";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { schema, type Db } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { RestrictionService } from "../users/restriction.service.js";
import { AccountController } from "../profiles/account.controller.js";
import { MeController } from "./me.controller.js";
import { hasActiveBan, type Auth } from "./auth.instance.js";
import { AuthGuard } from "./auth.guard.js";

function ctx(handler: (...args: never[]) => unknown = () => {}, cls: object = class {}): { context: ExecutionContext; req: { headers: object; user?: unknown } } {
  const req = { headers: {} };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
  return { context, req };
}

const fakeAuth = (id: string) =>
  ({ api: { getSession: async () => ({ user: { id, name: id, email: `${id}@x.test`, image: null, emailVerified: true } }) } }) as unknown as Auth;

describe("AuthGuard restrictions", () => {
  let db: Db;
  let restrictions: RestrictionService;

  beforeEach(async () => {
    db = await freshDb();
    restrictions = new RestrictionService(db);
    await insertUsers(db, ["u1", "u2"]);
  });

  it("lets an unrestricted user through and forwards emailVerified", async () => {
    const guard = new AuthGuard(fakeAuth("u1"), restrictions, new Reflector());
    const { context, req } = ctx();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toMatchObject({ id: "u1", emailVerified: true });
  });

  for (const type of ["BANNED", "SUSPENDED"] as const) {
    it(`rejects a ${type} user with RESTRICTED (403)`, async () => {
      await db.insert(schema.userRestrictions).values({ userId: "u1", type, reason: "test" });
      const guard = new AuthGuard(fakeAuth("u1"), restrictions, new Reflector());
      await expect(guard.canActivate(ctx().context)).rejects.toMatchObject({ code: "RESTRICTED", status: 403 });
    });
  }

  it("does not block on MUTE_CHAT or an expired suspension", async () => {
    await db.insert(schema.userRestrictions).values([
      { userId: "u1", type: "MUTE_CHAT", reason: "test" },
      { userId: "u1", type: "SUSPENDED", reason: "old", until: new Date(Date.now() - 1000) },
    ]);
    const guard = new AuthGuard(fakeAuth("u1"), restrictions, new Reflector());
    await expect(guard.canActivate(ctx().context)).resolves.toBe(true);
  });

  it("keeps account deletion reachable for a banned user", async () => {
    await db.insert(schema.userRestrictions).values({ userId: "u1", type: "BANNED", reason: "test" });
    const guard = new AuthGuard(fakeAuth("u1"), restrictions, new Reflector());
    const { context } = ctx(AccountController.prototype.delete, AccountController);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("GET /me uses OptionalAuthGuard, which never blocks restricted users", () => {
    const guards = Reflect.getMetadata("__guards__", MeController) as Array<{ name: string }>;
    expect(guards.map((g) => g.name)).toEqual(["OptionalAuthGuard"]);
  });

  it("caches the restriction lookup for ~30s", async () => {
    const spy = vi.spyOn(restrictions, "activeRestrictions");
    const guard = new AuthGuard(fakeAuth("u1"), restrictions, new Reflector());
    await guard.canActivate(ctx().context);
    await guard.canActivate(ctx().context);
    expect(spy).toHaveBeenCalledTimes(1);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 31_000);
    await guard.canActivate(ctx().context);
    vi.useRealTimers();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("hasActiveBan (used by the Better Auth session.create hook) only flags active BANs", async () => {
    await expect(hasActiveBan(db, "u1")).resolves.toBe(false);
    await db.insert(schema.userRestrictions).values({ userId: "u1", type: "SUSPENDED", reason: "t" });
    await expect(hasActiveBan(db, "u1")).resolves.toBe(false);
    await db.insert(schema.userRestrictions).values({ userId: "u1", type: "BANNED", reason: "t" });
    await expect(hasActiveBan(db, "u1")).resolves.toBe(true);
    await expect(hasActiveBan(db, "u2")).resolves.toBe(false);
  });
});
