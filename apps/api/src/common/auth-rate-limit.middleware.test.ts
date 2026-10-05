import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RateLimitService } from "../security/rate-limit.service.js";
import { authRateLimitMiddleware } from "./auth-rate-limit.middleware.js";

describe("authRateLimitMiddleware", () => {
  let server: Server;
  let base: string;
  let reached: unknown[];

  beforeEach(async () => {
    reached = [];
    const app = express();
    app.use("/api/auth", authRateLimitMiddleware(new RateLimitService()));
    app.all("/api/auth/*", (req, res) => {
      reached.push(req.body);
      res.json({ ok: true });
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${base}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("rate-limits sign-in per lowercased email (10 per window) with the API error shape, and passes the parsed body on", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await post("/sign-in/email", { email: i % 2 ? "A@Example.com" : "a@example.com", password: "x" });
      expect(res.status).toBe(200);
    }
    expect(reached[0]).toEqual({ email: "a@example.com", password: "x" });

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

  it("caps by Fly-Client-IP at 120 per window, and skips the cap when the header is absent", async () => {
    for (let i = 0; i < 120; i++) {
      const res = await post("/sign-in/email", { email: `u${i}@example.com`, password: "x" }, { "fly-client-ip": "203.0.113.9" });
      expect(res.status).toBe(200);
    }
    const blocked = await post("/sign-in/email", { email: "fresh@example.com", password: "x" }, { "fly-client-ip": "203.0.113.9" });
    expect(blocked.status).toBe(429);

    const otherIp = await post("/sign-in/email", { email: "fresh@example.com", password: "x" }, { "fly-client-ip": "203.0.113.10" });
    expect(otherIp.status).toBe(200);
    const noHeader = await post("/sign-in/email", { email: "fresh2@example.com", password: "x" });
    expect(noHeader.status).toBe(200);
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

  it("rate-limits reset-password per Fly-Client-IP at 10 per window", async () => {
    const headers = { "fly-client-ip": "203.0.113.50" };
    for (let i = 0; i < 10; i++) {
      expect((await post("/reset-password", { token: `t${i}`, newPassword: "x" }, headers)).status).toBe(200);
    }
    expect((await post("/reset-password", { token: "fresh", newPassword: "x" }, headers)).status).toBe(429);
    expect((await post("/reset-password", { token: "fresh", newPassword: "x" }, { "fly-client-ip": "203.0.113.51" })).status).toBe(200);
  });

  it("ignores other auth routes", async () => {
    for (let i = 0; i < 15; i++) {
      expect((await post("/sign-out", { email: "a@example.com" })).status).toBe(200);
    }
  });
});
