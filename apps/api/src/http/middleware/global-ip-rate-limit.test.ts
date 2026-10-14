import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { toErrorResponse } from "../../common/api-error.js";
import type { AppEnv } from "../context.js";
import { globalIpRateLimit, IpWindowCounter } from "./global-ip-rate-limit.js";

function start(counter: IpWindowCounter) {
  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
    return c.json(r.body, r.status as never);
  });
  app.use("*", async (c, next) => {
    c.set("ip", c.req.header("cf-connecting-ip") ?? "127.0.0.1");
    await next();
  });
  app.use("/api/v1/*", globalIpRateLimit(counter));
  app.all("/api/v1/*", (c) => c.json({ ok: true }));
  return app;
}

describe("IpWindowCounter", () => {
  it("allows up to the limit per window, then resets after the window", () => {
    const c = new IpWindowCounter(3, 1000);
    expect([c.hit("a", 0), c.hit("a", 1), c.hit("a", 2), c.hit("a", 3)]).toEqual([true, true, true, false]);
    expect(c.hit("b", 3)).toBe(true);
    expect(c.hit("a", 1000)).toBe(true);
  });
});

describe("globalIpRateLimit", () => {
  it("passes requests under the limit", async () => {
    const app = start(new IpWindowCounter(2, 60_000));
    expect((await app.request("/api/v1/rooms")).status).toBe(200);
  });

  it("answers 429 with the standard RATE_LIMITED error when over the limit", async () => {
    const app = start(new IpWindowCounter(1, 60_000));
    await app.request("/api/v1/rooms");
    const res = await app.request("/api/v1/rooms");
    expect(res.status).toBe(429);
    expect(JSON.stringify(await res.json())).toContain("RATE_LIMITED");
  });

  it("counts per client IP", async () => {
    const app = start(new IpWindowCounter(1, 60_000));
    await app.request("/api/v1/rooms", { headers: { "cf-connecting-ip": "203.0.113.1" } });
    expect((await app.request("/api/v1/rooms", { headers: { "cf-connecting-ip": "203.0.113.1" } })).status).toBe(429);
    expect((await app.request("/api/v1/rooms", { headers: { "cf-connecting-ip": "203.0.113.2" } })).status).toBe(200);
  });

  it("skips the health endpoint and the Mercado Pago webhook", async () => {
    const app = start(new IpWindowCounter(0, 60_000));
    expect((await app.request("/api/v1/health")).status).toBe(200);
    expect((await app.request("/api/v1/webhooks/mercadopago", { method: "POST" })).status).toBe(200);
    expect((await app.request("/api/v1/rooms")).status).toBe(429);
  });
});
