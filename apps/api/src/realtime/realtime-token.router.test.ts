import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../http/context.js";
import { realtimeTokenRouter } from "./realtime-token.router.js";
import { verifySocketToken } from "./socket-token.js";

function appWith(getSession: () => Promise<unknown>) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", { api: { getSession } } as never);
    c.set("services", { restriction: { activeRestrictions: async () => [] } } as never);
    c.set("user", null);
    await next();
  });
  app.route("/api/v1", realtimeTokenRouter);
  app.onError((_err, c) => c.json({ error: { code: "UNAUTHENTICATED" } }, 401));
  return app;
}

describe("GET /api/v1/realtime/token", () => {
  it("returns a verifiable token bound to the session", async () => {
    const app = appWith(async () => ({ user: { id: "u1", name: "n", email: "e@x.com", image: null }, session: { id: "s1" } }));
    const res = await app.request("/api/v1/realtime/token");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresAt: number };
    expect(verifySocketToken(body.token)).toEqual({ userId: "u1", sessionId: "s1" });
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("requires authentication", async () => {
    const res = await appWith(async () => null).request("/api/v1/realtime/token");
    expect(res.status).toBe(401);
  });
});
