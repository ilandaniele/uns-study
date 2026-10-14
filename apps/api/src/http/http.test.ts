import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { toErrorResponse } from "../common/api-error.js";
import type { Services } from "../services.js";
import { currentUser, type AppEnv } from "./context.js";
import { optionalAuth, requireAdmin, requireAdminOnly, requireAuth } from "./guards.js";
import { reply } from "./reply.js";
import { uuidParam, zBody, zQuery } from "./validate.js";

interface ErrBody { error: { code: string; message: string } }
const UUID = "123e4567-e89b-42d3-a456-426614174000";

interface Stubs {
  session?: { user: { id: string; name: string; email: string; image?: string | null; emailVerified?: boolean }; session?: { id: string } } | null;
  restrictions?: Array<{ type: string }>;
  roles?: string[];
}

function makeApp(stubs: Stubs = {}) {
  const hasRole = vi.fn(async (_id: string, allowed: string[]) => (stubs.roles ?? []).some((r) => allowed.includes(r)));
  const activeRestrictions = vi.fn(async () => stubs.restrictions ?? []);
  const assertNot = vi.fn(async (_id: string, types: string[]) => {
    if ((stubs.restrictions ?? []).some((r) => types.includes(r.type))) {
      const { ApiErrors } = await import("../common/api-error.js");
      throw ApiErrors.restricted();
    }
  });
  const services = { roles: { hasRole }, restriction: { activeRestrictions, assertNot } } as unknown as Services;
  const auth = { api: { getSession: async () => stubs.session ?? null } } as never;

  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("services", services);
    c.set("auth", auth);
    c.set("ip", "127.0.0.1");
    c.set("user", null);
    await next();
  });
  app.onError((err, c) => {
    const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
    return c.json(r.body, r.status as never);
  });
  app.get("/auth", requireAuth(), (c) => c.json({ id: currentUser(c).id, sid: c.var.user?.sessionId }));
  app.get("/auth-restricted-ok", requireAuth({ allowRestricted: true }), (c) => c.json({ id: currentUser(c).id }));
  app.get("/optional", optionalAuth, (c) => c.json({ id: c.var.user?.id ?? null }));
  app.get("/admin", requireAdmin, (c) => c.json({ ok: true }));
  app.get("/admin-only", requireAdminOnly, (c) => c.json({ ok: true }));
  app.get("/current", (c) => c.json({ id: currentUser(c).id }));
  app.get("/things/:id", uuidParam("id"), (c) => c.json({ id: c.req.param("id") }));
  app.post("/body", zBody(z.object({ n: z.number().int(), s: z.string().default("x") })), (c) => c.json(c.req.valid("json")));
  app.get("/query", zQuery(z.object({ q: z.string().min(2) })), (c) => c.json(c.req.valid("query")));
  app.get("/reply-null", (c) => reply(c, null, 204));
  app.get("/reply-obj", (c) => reply(c, { a: 1 }, 201));
  app.get("/reply-default", (c) => reply(c, [1, 2]));
  return { app, hasRole, activeRestrictions };
}

const user = { id: "u1", name: "U", email: "u@x.test", image: null, emailVerified: true };

describe("guards", () => {
  it("requireAuth: 401 UNAUTHENTICATED without a session", async () => {
    const res = await makeApp().app.request("/auth");
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrBody).error.code).toBe("UNAUTHENTICATED");
  });

  it("requireAuth: sets the user with the session id", async () => {
    const res = await makeApp({ session: { user, session: { id: "s1" } } }).app.request("/auth");
    expect(await res.json()).toEqual({ id: "u1", sid: "s1" });
  });

  it("requireAuth: SUSPENDED/BANNED users get RESTRICTED 403 unless allowRestricted", async () => {
    const { app } = makeApp({ session: { user: { ...user, id: "u-banned" } }, restrictions: [{ type: "BANNED" }] });
    const res = await app.request("/auth");
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrBody).error.code).toBe("RESTRICTED");
    expect((await app.request("/auth-restricted-ok")).status).toBe(200);
  });

  it("requireAuth: other restriction types pass, and the lookup is cached", async () => {
    const { app, activeRestrictions } = makeApp({ session: { user: { ...user, id: "u-muted" } }, restrictions: [{ type: "MUTED" }] });
    expect((await app.request("/auth")).status).toBe(200);
    expect((await app.request("/auth")).status).toBe(200);
    expect(activeRestrictions).toHaveBeenCalledTimes(1);
  });

  it("optionalAuth: anonymous passes with a null user", async () => {
    const res = await makeApp().app.request("/optional");
    expect(await res.json()).toEqual({ id: null });
    expect(await (await makeApp({ session: { user } }).app.request("/optional")).json()).toEqual({ id: "u1" });
  });

  it("currentUser throws UNAUTHENTICATED when no guard ran", async () => {
    expect((await makeApp().app.request("/current")).status).toBe(401);
  });

  it("requireAdmin: ADMIN and MODERATOR pass, others get the moderation 403", async () => {
    expect((await makeApp({ session: { user: { ...user, id: "m" } }, roles: ["MODERATOR"] }).app.request("/admin")).status).toBe(200);
    const denied = await makeApp({ session: { user: { ...user, id: "n" } }, roles: [] }).app.request("/admin");
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: { code: "FORBIDDEN", message: "Necesitás permisos de moderación para hacer esto." } });
    expect((await makeApp().app.request("/admin")).status).toBe(401);
  });

  it("requireAdminOnly: MODERATOR is rejected, ADMIN passes", async () => {
    expect((await makeApp({ session: { user }, roles: ["MODERATOR"] }).app.request("/admin-only")).status).toBe(403);
    expect((await makeApp({ session: { user }, roles: ["ADMIN"] }).app.request("/admin-only")).status).toBe(200);
  });

  it("requireAdmin: a banned admin loses staff access", async () => {
    const { app } = makeApp({ session: { user: { ...user, id: "ba" } }, roles: ["ADMIN"], restrictions: [{ type: "BANNED" }] });
    const res = await app.request("/admin");
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrBody).error.code).toBe("RESTRICTED");
  });
});

describe("validation", () => {
  it("uuidParam: 400 VALIDATION_ERROR on a malformed id, pass on a uuid", async () => {
    const { app } = makeApp();
    const bad = await app.request("/things/nope");
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: { code: "VALIDATION_ERROR", message: "Identificador inválido." } });
    expect((await app.request(`/things/${UUID}`)).status).toBe(200);
  });

  const post = (app: Hono<AppEnv>, body: string) =>
    app.request("/body", { method: "POST", headers: { "content-type": "application/json" }, body });

  it("zBody: parses and applies defaults", async () => {
    const res = await post(makeApp().app, JSON.stringify({ n: 3 }));
    expect(await res.json()).toEqual({ n: 3, s: "x" });
  });

  it("zBody: 400 with path-prefixed messages on schema failure", async () => {
    const res = await post(makeApp().app, JSON.stringify({ n: "no" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrBody;
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/^n: /);
  });

  it("zBody: invalid JSON is VALIDATION_ERROR 400", async () => {
    const res = await post(makeApp().app, "{nope");
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrBody).error.code).toBe("VALIDATION_ERROR");
  });

  it("zQuery: validates the query string", async () => {
    const { app } = makeApp();
    expect(await (await app.request("/query?q=ab")).json()).toEqual({ q: "ab" });
    expect((await app.request("/query?q=a")).status).toBe(400);
  });
});

describe("reply", () => {
  it("null/undefined gives an empty body with the status", async () => {
    const res = await makeApp().app.request("/reply-null");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("objects and arrays are JSON, default status 200", async () => {
    const { app } = makeApp();
    const obj = await app.request("/reply-obj");
    expect(obj.status).toBe(201);
    expect(await obj.json()).toEqual({ a: 1 });
    const arr = await app.request("/reply-default");
    expect(arr.status).toBe(200);
    expect(await arr.json()).toEqual([1, 2]);
  });
});
