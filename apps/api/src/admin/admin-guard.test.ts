import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { toErrorResponse } from "../common/api-error.js";
import { requireAdmin, requireAdminOnly } from "../http/guards.js";
import type { AppEnv } from "../http/context.js";
import type { Services } from "../services.js";
import { freshDb, insertUsers } from "../test-utils.js";
import { RolesService } from "../users/roles.service.js";
import { RestrictionService } from "../users/restriction.service.js";

type Session = { user: { id: string; name: string; email: string; image: string | null } } | null;

const sessionFor = (id: string): Session => ({ user: { id, name: id, email: `${id}@example.test`, image: null } });

/** The admin routers use exactly these guards; here they run against the real roles/restriction services. */
function buildApp(db: Db, session: Session) {
  const services = { roles: new RolesService(db), restriction: new RestrictionService(db) } as unknown as Services;
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("services", services);
    c.set("auth", { api: { getSession: async () => session } } as never);
    c.set("ip", "127.0.0.1");
    c.set("user", null);
    await next();
  });
  app.onError((err, c) => {
    const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
    return c.json(r.body, r.status as never);
  });
  app.get("/staff", requireAdmin, (c) => c.json({ ok: true }));
  app.get("/admin-only", requireAdminOnly, (c) => c.json({ ok: true }));
  return app;
}

async function code(res: Response): Promise<string | undefined> {
  return ((await res.json()) as { error?: { code: string } }).error?.code;
}

describe("admin guards", () => {
  let db: Db;

  beforeEach(async () => {
    db = freshDb();
    await insertUsers(db, ["plain", "admin", "mod"]);
    await db.insert(schema.userRoles).values([
      { userId: "admin", role: "ADMIN" },
      { userId: "mod", role: "MODERATOR" },
    ]);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await buildApp(db, null).request("/staff");
    expect(res.status).toBe(401);
    expect(await code(res)).toBe("UNAUTHENTICATED");
  });

  it("rejects an authenticated non-admin user with 403 FORBIDDEN", async () => {
    const res = await buildApp(db, sessionFor("plain")).request("/staff");
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("FORBIDDEN");
  });

  it("rejects a banned admin with RESTRICTED", async () => {
    await db.insert(schema.userRestrictions).values({ userId: "admin", type: "BANNED", reason: "x" });
    const app = buildApp(db, sessionFor("admin"));
    expect(await code(await app.request("/staff"))).toBe("RESTRICTED");
    expect(await code(await app.request("/admin-only"))).toBe("RESTRICTED");
  });

  it("rejects a suspended admin with RESTRICTED", async () => {
    await db.insert(schema.userRestrictions).values({ userId: "admin", type: "SUSPENDED", reason: "x" });
    expect(await code(await buildApp(db, sessionFor("admin")).request("/staff"))).toBe("RESTRICTED");
  });

  it("allows an ADMIN user through both guards", async () => {
    const app = buildApp(db, sessionFor("admin"));
    expect((await app.request("/staff")).status).toBe(200);
    expect((await app.request("/admin-only")).status).toBe(200);
  });

  it("lets a MODERATOR through the staff guard but not the admin-only one", async () => {
    const app = buildApp(db, sessionFor("mod"));
    expect((await app.request("/staff")).status).toBe(200);
    const res = await app.request("/admin-only");
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("FORBIDDEN");
  });
});
