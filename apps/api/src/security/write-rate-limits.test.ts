import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { toErrorResponse } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import type { Services } from "../services.js";
import { blocksRouter } from "../blocks/blocks.router.js";
import { dmRouter } from "../dm/dm.router.js";
import { profilesRouter } from "../profiles/profiles.router.js";
import { qrRouter } from "../qr/qr.router.js";
import { studyRouter } from "../study/study.router.js";
import { RateLimitService } from "./rate-limit.service.js";

const user = { id: "u1", name: "u1", email: "u1@example.test", image: null };
const ok = async () => ({});

/** Mounts one router with a real RateLimitService, a stubbed session and stubbed domain services. */
function mount(router: Hono<AppEnv>, services: object) {
  const app = new Hono<AppEnv>();
  const rateLimit = new RateLimitService();
  app.use("*", async (c, next) => {
    c.set("services", {
      rateLimit,
      restriction: { activeRestrictions: async () => [] },
      ...services,
    } as unknown as Services);
    c.set("auth", { api: { getSession: async () => ({ user, session: { id: "s1" } }) } } as never);
    c.set("ip", "1.1.1.1");
    c.set("user", null);
    await next();
  });
  app.route("/api/v1", router);
  app.onError((err, c) => {
    const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
    return c.json(r.body, r.status as never);
  });
  return app;
}

const json = (method: string, body: unknown = {}) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function exhaust(limit: number, call: () => Promise<Response>) {
  for (let i = 0; i < limit; i++) expect((await call()).status).toBeLessThan(400);
  const blocked = await call();
  expect(blocked.status).toBe(429);
  expect(await blocked.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
}

describe("rate limits on previously unrated writes", () => {
  it("POST /conversations: 10/h per user", async () => {
    const app = mount(dmRouter, { dm: { getOrCreateConversation: ok } });
    await exhaust(10, async () => app.request("/api/v1/conversations", json("POST", { userId: "00000000-0000-4000-8000-000000000002" })));
  });

  it("block and unblock share a 30/h per-user bucket", async () => {
    const app = mount(blocksRouter, { blocks: { block: ok, unblock: ok } });
    for (let i = 0; i < 15; i++) {
      expect((await app.request("/api/v1/users/u2/block", { method: "POST" })).status).toBe(201);
      expect((await app.request("/api/v1/users/u2/block", { method: "DELETE" })).status).toBe(200);
    }
    expect((await app.request("/api/v1/users/u2/block", { method: "POST" })).status).toBe(429);
  });

  it("PATCH /profiles/me and /privacy share a 30/h per-user bucket", async () => {
    const app = mount(profilesRouter, { profiles: { updateMyProfile: ok, updateMyPrivacy: ok } });
    for (let i = 0; i < 15; i++) {
      expect((await app.request("/api/v1/profiles/me", json("PATCH"))).status).toBe(200);
      expect((await app.request("/api/v1/profiles/me/privacy", json("PATCH"))).status).toBe(200);
    }
    expect((await app.request("/api/v1/profiles/me", json("PATCH"))).status).toBe(429);
  });

  it("POST /study/start: 60/h per user", async () => {
    const app = mount(studyRouter, { study: { start: ok, stop: ok } });
    await exhaust(60, async () => app.request("/api/v1/study/start", json("POST", { roomId: "r" })));
  });

  it("POST /study/stop: 30/min per user", async () => {
    const app = mount(studyRouter, { study: { start: ok, stop: ok } });
    await exhaust(30, async () => app.request("/api/v1/study/stop", { method: "POST" }));
  });

  it("GET /qr/:token: 60/min per IP", async () => {
    const app = mount(qrRouter, { qr: { resolve: ok } });
    await exhaust(60, async () => app.request("/api/v1/qr/tok"));
  });
});
