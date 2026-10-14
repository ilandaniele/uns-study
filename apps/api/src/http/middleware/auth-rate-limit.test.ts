import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { toErrorResponse } from "../../common/api-error.js";
import { RateLimitService } from "../../security/rate-limit.service.js";
import type { AppEnv } from "../context.js";
import { authRateLimit } from "./auth-rate-limit.js";

describe("authRateLimit", () => {
  let app: Hono<AppEnv>;
  let reached: unknown[];

  beforeEach(() => {
    reached = [];
    app = new Hono<AppEnv>();
    app.onError((err, c) => {
      const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
      return c.json(r.body, r.status as never);
    });
    app.use("*", async (c, next) => {
      c.set("ip", c.req.header("cf-connecting-ip") ?? "127.0.0.1");
      await next();
    });
    app.on(["GET", "POST"], "/api/auth/*", authRateLimit(new RateLimitService()), async (c) => {
      reached.push(await c.req.json().catch(() => null));
      return c.json({ ok: true });
    });
  });

  function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return app.request(`/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("rate-limits sign-in per lowercased email (10 per window) with the API error shape, and passes the body on", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await post("/sign-in/email", { email: i % 2 ? "A@Example.com" : "a@example.com", password: "x" });
      expect(res.status).toBe(200);
    }
    expect(reached[1]).toEqual({ email: "A@Example.com", password: "x" });

    const blocked = await post("/sign-in/email", { email: "A@EXAMPLE.COM", password: "x" });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });

    const other = await post("/sign-in/email", { email: "b@example.com", password: "x" });
    expect(other.status).toBe(200);
  });

  it("rate-limits sign-up per email at 5 per window, separately from sign-in", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post("/sign-up/email", { email: "n@example.com", password: "x", name: "n" })).status).toBe(200);
    }
    expect((await post("/sign-up/email", { email: "n@example.com", password: "x", name: "n" })).status).toBe(429);
    expect((await post("/sign-in/email", { email: "n@example.com", password: "x" })).status).toBe(200);
  });

  it("caps by client IP at 120 per window", async () => {
    const ip = { "cf-connecting-ip": "203.0.113.9" };
    for (let i = 0; i < 120; i++) {
      expect((await post("/sign-in/email", { email: `u${i}@example.com`, password: "x" }, ip)).status).toBe(200);
    }
    expect((await post("/sign-in/email", { email: "fresh@example.com", password: "x" }, ip)).status).toBe(429);
    expect((await post("/sign-in/email", { email: "fresh@example.com", password: "x" }, { "cf-connecting-ip": "203.0.113.10" })).status).toBe(200);
  });

  it("rate-limits password reset requests per email at 3 per hour, separately from sign-in", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await post("/request-password-reset", { email: i % 2 ? "R@Example.com" : "r@example.com" })).status).toBe(200);
    }
    expect((await post("/request-password-reset", { email: "R@EXAMPLE.COM" })).status).toBe(429);
    expect((await post("/request-password-reset", { email: "other@example.com" })).status).toBe(200);
    expect((await post("/sign-in/email", { email: "r@example.com", password: "x" })).status).toBe(200);
  });

  it("rate-limits reset-password per token at 5 per window", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post("/reset-password", { token: "tok-a", newPassword: "x" })).status).toBe(200);
    }
    expect((await post("/reset-password", { token: "tok-a", newPassword: "x" })).status).toBe(429);
    expect((await post("/reset-password", { token: "tok-b", newPassword: "x" })).status).toBe(200);
  });

  it("rate-limits reset-password per client IP at 10 per window", async () => {
    const ip = { "cf-connecting-ip": "203.0.113.50" };
    for (let i = 0; i < 10; i++) {
      expect((await post("/reset-password", { token: `t${i}`, newPassword: "x" }, ip)).status).toBe(200);
    }
    expect((await post("/reset-password", { token: "fresh", newPassword: "x" }, ip)).status).toBe(429);
    expect((await post("/reset-password", { token: "fresh", newPassword: "x" }, { "cf-connecting-ip": "203.0.113.51" })).status).toBe(200);
  });

  it("rejects a body over 16kb with 413 on non-limited auth routes too", async () => {
    const res = await post("/change-password", { newPassword: "x".repeat(17 * 1024) });
    expect(res.status).toBe(413);
    expect(reached).toHaveLength(0);
    expect((await post("/change-password", { newPassword: "x" })).status).toBe(200);
  });

  it("ignores other auth routes", async () => {
    for (let i = 0; i < 15; i++) {
      expect((await post("/sign-out", { email: "a@example.com" })).status).toBe(200);
    }
  });
});
