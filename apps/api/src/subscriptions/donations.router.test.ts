import { donationCheckoutSchema } from "@sala/contracts";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { toErrorResponse } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import type { Services } from "../services.js";
import { donationsRouter } from "./donations.router.js";

function make(opts: { allowed?: boolean; mp?: boolean } = {}) {
  const { allowed = true, mp: hasMp = true } = opts;
  const mp = { createPreference: vi.fn().mockResolvedValue({ id: "p1", init_point: "https://mp.example/checkout" }) };
  const rateLimit = { check: vi.fn().mockResolvedValue({ allowed }) };
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("services", { mercadoPago: hasMp ? mp : null, rateLimit } as unknown as Services);
    c.set("ip", "1.2.3.4");
    c.set("user", null);
    await next();
  });
  app.route("/api/v1", donationsRouter);
  app.onError((err, c) => {
    const r = toErrorResponse(err, { method: c.req.method, path: c.req.path });
    return c.json(r.body, r.status as never);
  });
  const post = (body: unknown) =>
    app.request("/api/v1/donations/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { post, mp, rateLimit };
}

describe("donations router", () => {
  it("returns the Checkout Pro URL for an allowed amount", async () => {
    const { post, mp } = make();
    const res = await post({ amount: 2000 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ initPoint: "https://mp.example/checkout" });
    expect(mp.createPreference.mock.calls[0][0].items[0].unit_price).toBe(2000);
  });

  it("accepts custom whole-peso amounts within bounds only", async () => {
    expect(donationCheckoutSchema.safeParse({ amount: 1 }).success).toBe(false);
    expect(donationCheckoutSchema.safeParse({ amount: 1500.5 }).success).toBe(false);
    expect(donationCheckoutSchema.safeParse({ amount: 2_000_000 }).success).toBe(false);
    expect(donationCheckoutSchema.safeParse({ amount: 1500 }).success).toBe(true);
    expect((await make().post({ amount: 1 })).status).toBe(400);
  });

  it("rate limits per IP", async () => {
    const { post, mp, rateLimit } = make({ allowed: false });
    expect((await post({ amount: 1000 })).status).toBe(429);
    expect(rateLimit.check).toHaveBeenCalledWith("donations:checkout:1.2.3.4", 10, 3600);
    expect(mp.createPreference).not.toHaveBeenCalled();
  });

  it("is disabled without Mercado Pago credentials", async () => {
    const { post, rateLimit } = make({ mp: false });
    expect((await post({ amount: 1000 })).status).not.toBe(200);
    expect(rateLimit.check).not.toHaveBeenCalled();
  });
});
