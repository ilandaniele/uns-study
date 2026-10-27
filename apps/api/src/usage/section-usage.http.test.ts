import { beforeEach, describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import { baseHeaders, buildTestApp } from "../http/test-app.js";

describe("section usage HTTP boundaries", () => {
  let ctx: ReturnType<typeof buildTestApp>;
  beforeEach(() => { ctx = buildTestApp(); });
  function call(method: string, path: string, body?: unknown, cookie?: string, origin?: string) {
    return ctx.app.request(`/api/v1${path}`, { method, headers: baseHeaders({ ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...(origin ? { origin } : {}) }), ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  it("accepts an anonymous enum, rejects private data and foreign-origin writes", async () => {
    expect((await call("POST", "/usage/section", { section: "jardin" })).status).toBe(204);
    expect((await call("POST", "/usage/section", { section: "admin" })).status).toBe(400);
    expect((await call("POST", "/usage/section", { section: "jardin", userId: "private-id" })).status).toBe(400);
    expect((await call("POST", "/usage/section", { section: "jardin" }, undefined, "https://outside.example")).status).toBe(403);
    expect(ctx.db.select().from(schema.appSectionDailyViews).all()).toMatchObject([{ section: "jardin", views: 1 }]);
  });
  it("bounds anonymous writes without persistent IP buckets", async () => {
    for (let i = 0; i < 30; i++) expect((await call("POST", "/usage/section", { section: "sala" })).status).toBe(204);
    expect((await call("POST", "/usage/section", { section: "sala" })).status).toBe(429);
    expect(ctx.db.select().from(schema.appSectionDailyViews).get()?.views).toBe(30);
    expect(ctx.db.select().from(schema.rateLimitHits).all()).toHaveLength(0);
  });
  it("protects aggregate reports from anonymous and normal users, validates periods, and disables caching", async () => {
    expect((await call("GET", "/admin/usage/sections")).status).toBe(401);
    const signup = await ctx.app.request("/api/auth/sign-up/email", { method: "POST", headers: baseHeaders({ "content-type": "application/json" }), body: JSON.stringify({ email: "usage-admin@example.invalid", password: "correct-horse-battery", name: "Prueba" }) });
    expect(signup.status).toBe(200);
    const { user } = await signup.json() as { user: { id: string } };
    const cookie = signup.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    expect((await call("GET", "/admin/usage/sections", undefined, cookie)).status).toBe(403);
    ctx.db.insert(schema.userRoles).values({ userId: user.id, role: "ADMIN" }).run();
    const report = await call("GET", "/admin/usage/sections?days=30", undefined, cookie);
    expect(report.status).toBe(200);
    expect(report.headers.get("cache-control")).toBe("private, no-store");
    expect(await report.json()).toMatchObject({ days: 30, total: 0 });
    expect((await call("GET", "/admin/usage/sections?days=365", undefined, cookie)).status).toBe(400);
  });
});
