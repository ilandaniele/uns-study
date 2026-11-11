import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../env.js";
import { buildTestApp } from "../http/test-app.js";
import { insertUsers } from "../test-utils.js";
import type { MpPayment } from "./mercadopago.client.js";

describe("Mercado Pago signed payment HTTP flow (synthetic provider)", () => {
  const original = { mpAccessToken: env.mpAccessToken, mpWebhookSecret: env.mpWebhookSecret };
  let ctx: ReturnType<typeof buildTestApp>;
  let payment: MpPayment;

  beforeEach(async () => {
    Object.assign(env, { mpAccessToken: "synthetic-token", mpWebhookSecret: "synthetic-signature-key" });
    ctx = buildTestApp();
    await insertUsers(ctx.db, ["payment-owner", "other-user"]);
    vi.spyOn(ctx.services.mercadoPago!, "createPreference").mockImplementation(async (body) => {
      payment = {
        id: "123", external_reference: body.external_reference!, status: "approved",
        currency_id: "ARS", transaction_amount: 5000, date_last_updated: new Date().toISOString(),
      };
      return { id: "synthetic-preference", init_point: "https://www.mercadopago.com.ar/checkout/test" };
    });
    vi.spyOn(ctx.services.mercadoPago!, "getPayment").mockImplementation(async () => payment);
    await ctx.services.gardenPurchases.checkout("payment-owner");
  });

  afterEach(() => { Object.assign(env, original); vi.restoreAllMocks(); });

  function notify(valid = true) {
    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = "synthetic-request";
    const signature = createHmac("sha256", env.mpWebhookSecret)
      .update(`id:123;request-id:${requestId};ts:${ts};`).digest("hex");
    return ctx.app.request("/api/v1/webhooks/mercadopago?type=payment&data.id=123", {
      method: "POST", headers: {
        "content-type": "application/json", "x-request-id": requestId,
        "x-signature": `ts=${ts},v1=${valid ? signature : "invalid"}`,
      }, body: JSON.stringify({ type: "payment", data: { id: "123" } }),
    });
  }

  it("authenticates checkout and credits the order owner once through signed webhook retries", async () => {
    const denied = await ctx.app.request("/api/v1/me/garden/checkout", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    expect(denied.status).toBe(401);
    expect((await ctx.services.garden.get("payment-owner")).seeds).toBe(30);
    expect((await notify()).status).toBe(200);
    expect((await notify()).status).toBe(200);
    expect((await ctx.services.garden.get("payment-owner")).seeds).toBe(130);
    expect((await ctx.services.garden.get("other-user")).seeds).toBe(30);
    payment = { ...payment, status: "refunded", date_last_updated: new Date(Date.now() + 1000).toISOString() };
    expect((await notify()).status).toBe(200);
    expect((await notify()).status).toBe(200);
    expect((await ctx.services.garden.get("payment-owner")).seeds).toBe(30);
  });

  it("rejects a forged notification before contacting the provider", async () => {
    expect((await notify(false)).status).toBe(401);
    expect(ctx.services.mercadoPago!.getPayment).not.toHaveBeenCalled();
    expect((await ctx.services.garden.get("payment-owner")).seeds).toBe(30);
  });

  it("acknowledges pending payments and wrong amounts without awarding seeds", async () => {
    payment.status = "pending";
    expect((await notify()).status).toBe(200);
    payment = { ...payment, status: "approved", transaction_amount: 1 };
    expect((await notify()).status).toBe(200);
    expect((await ctx.services.garden.get("payment-owner")).seeds).toBe(30);
  });
});
