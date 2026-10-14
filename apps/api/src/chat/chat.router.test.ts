import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { toErrorResponse } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import type { Services } from "../services.js";
import { chatRouter } from "./chat.router.js";

/** In-memory fixed counter standing in for RateLimitService (same `check(key, limit, windowSec)` shape). */
function fakeRateLimit() {
  const hits = new Map<string, number>();
  return {
    check: async (key: string, limit: number) => {
      const n = (hits.get(key) ?? 0) + 1;
      hits.set(key, n);
      return { allowed: n <= limit, remaining: Math.max(0, limit - n) };
    },
  };
}

function buildApp(rateLimit: ReturnType<typeof fakeRateLimit>) {
  const services = {
    chat: { createMessage: async () => ({ id: "m1", chatRoomId: "c1", mine: true }) },
    rateLimit,
    restriction: { activeRestrictions: async () => [] },
    realtime: { emitChatMessage: () => {} },
  } as unknown as Services;
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("services", services);
    c.set("auth", { api: { getSession: async () => ({ user: { id: c.req.header("x-user") ?? "u1", name: "U", email: "u@x.test" } }) } } as never);
    c.set("ip", "127.0.0.1");
    c.set("user", null);
    await next();
  });
  app.onError((err, c) => {
    const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
    return c.json(r.body, r.status as never);
  });
  app.route("/", chatRouter);
  return app;
}

function post(app: Hono<AppEnv>, user: string) {
  return app.request("/rooms/principal/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user": user },
    body: JSON.stringify({ content: "hola" }),
  });
}

describe("chatRouter rate limiting", () => {
  let app: Hono<AppEnv>;

  beforeEach(() => {
    app = buildApp(fakeRateLimit());
  });

  it("allows up to 20 messages per minute then rate-limits", async () => {
    for (let i = 0; i < 20; i++) expect((await post(app, "u1")).status).toBe(201);
    const res = await post(app, "u1");
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
  });

  it("tracks limits independently per user", async () => {
    for (let i = 0; i < 20; i++) await post(app, "u1");
    expect((await post(app, "u2")).status).toBe(201);
  });
});
