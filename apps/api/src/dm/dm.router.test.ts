import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { toErrorResponse } from "../common/api-error.js";
import { flushBackground } from "../common/background.js";
import type { AppEnv } from "../http/context.js";
import type { Services } from "../services.js";
import { dmRouter } from "./dm.router.js";

const CONVERSATION = "123e4567-e89b-42d3-a456-426614174000";

/** In-memory counter standing in for RateLimitService (same `check(key, limit, windowSec)` shape). */
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

function buildApp(overrides: Record<string, unknown> = {}) {
  const services = {
    dm: {
      sendMessage: async () => ({ id: "m1", conversationId: "c1" }),
      otherParticipant: async () => "u2",
      publicDisplayName: async () => "Zorro Veloz",
    },
    rateLimit: fakeRateLimit(),
    restriction: { activeRestrictions: async () => [] },
    realtime: { emitDm: () => {} },
    notifications: { notifyDirectMessage: async () => {} },
    ...overrides,
  } as unknown as Services;
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("services", services);
    c.set("auth", { api: { getSession: async () => ({ user: { id: "u1", name: "u1", email: "u1@x.test" } }) } } as never);
    c.set("ip", "127.0.0.1");
    c.set("user", null);
    await next();
  });
  app.onError((err, c) => {
    const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
    return c.json(r.body, r.status as never);
  });
  app.route("/", dmRouter);
  return app;
}

function send(app: Hono<AppEnv>, content = "hola") {
  return app.request(`/conversations/${CONVERSATION}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

describe("dmRouter rate limiting", () => {
  it("allows up to 15 messages per minute then rate-limits", async () => {
    const app = buildApp();
    for (let i = 0; i < 15; i++) expect((await send(app)).status).toBe(201);
    const res = await send(app);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
  });
});

describe("dmRouter push", () => {
  it("pushes the message to the other participant only, under the sender's public name", async () => {
    const notifyDirectMessage = vi.fn(async () => {});
    const app = buildApp({
      dm: {
        sendMessage: async () => ({ id: "m1", conversationId: "c1", content: "hola, ¿venís?" }),
        otherParticipant: async () => "u2",
        publicDisplayName: async () => "Zorro Veloz",
      },
      notifications: { notifyDirectMessage },
    });

    await send(app, "hola, ¿venís?");
    await flushBackground();

    expect(notifyDirectMessage).toHaveBeenCalledTimes(1);
    expect(notifyDirectMessage).toHaveBeenCalledWith({
      recipientId: "u2",
      senderDisplayName: "Zorro Veloz",
      conversationId: CONVERSATION,
      content: "hola, ¿venís?",
    });
  });

  it("marks read with status 200", async () => {
    const markRead = vi.fn(async () => {});
    const app = buildApp({ dm: { markRead } });
    const res = await app.request(`/conversations/${CONVERSATION}/read`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(markRead).toHaveBeenCalledWith(CONVERSATION, "u1");
  });
});
