import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { globalIpRateLimitMiddleware, IpWindowCounter } from "./global-ip-rate-limit.middleware.js";

let server: ReturnType<express.Express["listen"]> | null = null;

async function start(counter: IpWindowCounter) {
  const app = express();
  app.use("/api/v1", globalIpRateLimitMiddleware(counter));
  app.all("/api/v1/*splat", (_req, res) => void res.json({ ok: true }));
  server = app.listen(0);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(() => {
  server?.close();
  server = null;
});

describe("IpWindowCounter", () => {
  it("allows up to the limit per window, then resets after the window", () => {
    const c = new IpWindowCounter(3, 1000);
    expect([c.hit("a", 0), c.hit("a", 1), c.hit("a", 2), c.hit("a", 3)]).toEqual([true, true, true, false]);
    expect(c.hit("b", 3)).toBe(true);
    expect(c.hit("a", 1000)).toBe(true);
  });
});

describe("globalIpRateLimitMiddleware", () => {
  it("passes requests under the limit", async () => {
    const base = await start(new IpWindowCounter(2, 60_000));
    expect((await fetch(`${base}/api/v1/rooms`)).status).toBe(200);
  });

  it("answers 429 with the standard RATE_LIMITED error when over the limit", async () => {
    const base = await start(new IpWindowCounter(1, 60_000));
    await fetch(`${base}/api/v1/rooms`);
    const res = await fetch(`${base}/api/v1/rooms`);
    expect(res.status).toBe(429);
    expect(JSON.stringify(await res.json())).toContain("RATE_LIMITED");
  });

  it("skips the health endpoint and the Mercado Pago webhook", async () => {
    const base = await start(new IpWindowCounter(0, 60_000));
    expect((await fetch(`${base}/api/v1/health`)).status).toBe(200);
    expect((await fetch(`${base}/api/v1/webhooks/mercadopago`, { method: "POST" })).status).toBe(200);
    expect((await fetch(`${base}/api/v1/rooms`)).status).toBe(429);
  });
});
