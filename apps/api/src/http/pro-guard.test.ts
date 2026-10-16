import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { toErrorResponse } from "../common/api-error.js";
import { FixedClock } from "../platform/clock.js";
import type { Services } from "../services.js";
import { ProService } from "../subscriptions/pro.js";
import { freshDb, insertUsers } from "../test-utils.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RolesService } from "../users/roles.service.js";
import type { AppEnv } from "./context.js";
import { requireAuth, requirePro } from "./guards.js";

const NOW = new Date("2026-10-16T12:00:00Z");

function buildApp(db: Db, userId: string, subscriptionsEnabled: boolean) {
  const roles = new RolesService(db);
  const services = {
    roles,
    restriction: new RestrictionService(db),
    pro: new ProService(db, roles, { subscriptionsEnabled, clock: new FixedClock(NOW) }),
  } as unknown as Services;
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("services", services);
    c.set("auth", { api: { getSession: async () => ({ user: { id: userId, name: userId, email: `${userId}@example.test`, image: null } }) } } as never);
    c.set("ip", "127.0.0.1");
    c.set("user", null);
    await next();
  });
  app.onError((err, c) => {
    const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
    return c.json(r.body, r.status as never);
  });
  app.get("/pro", requireAuth(), requirePro(), (c) => c.json({ ok: true }));
  return app;
}

async function code(res: Response): Promise<string | undefined> {
  return ((await res.json()) as { error?: { code: string } }).error?.code;
}

describe("requirePro", () => {
  let db: Db;

  beforeEach(async () => {
    db = freshDb();
    await insertUsers(db, ["free", "paid", "staff"]);
    await db.insert(schema.userSubscriptions).values({ userId: "paid", providerSubscriptionId: "sub-paid", status: "authorized" });
    await db.insert(schema.userRoles).values({ userId: "staff", role: "ADMIN" });
  });

  it("answers 403 PRO_REQUIRED to a free user", async () => {
    const res = await buildApp(db, "free", true).request("/pro");
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("PRO_REQUIRED");
  });

  it("lets an authorized subscriber through", async () => {
    expect((await buildApp(db, "paid", true).request("/pro")).status).toBe(200);
  });

  it("lets staff through", async () => {
    expect((await buildApp(db, "staff", true).request("/pro")).status).toBe(200);
  });

  it("lets everyone through when subscriptions are disabled", async () => {
    expect((await buildApp(db, "free", false).request("/pro")).status).toBe(200);
  });
});
