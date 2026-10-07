import { donationCheckoutSchema } from "@sala/contracts";
import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import type { RateLimitService } from "../security/rate-limit.service.js";
import { DonationsController } from "./donations.controller.js";
import type { MercadoPagoClient } from "./mercadopago.client.js";

const req = { ip: "1.2.3.4" } as Request;

function make(allowed = true) {
  const mp = { createPreference: vi.fn().mockResolvedValue({ id: "p1", init_point: "https://mp.example/checkout" }) };
  const rateLimit = { check: vi.fn().mockResolvedValue({ allowed }) };
  const controller = new DonationsController(mp as unknown as MercadoPagoClient, rateLimit as unknown as RateLimitService);
  return { controller, mp, rateLimit };
}

describe("DonationsController", () => {
  it("returns the Checkout Pro URL for an allowed amount", async () => {
    const { controller, mp } = make();
    await expect(controller.checkout(req, { amount: 2000 })).resolves.toEqual({ initPoint: "https://mp.example/checkout" });
    expect(mp.createPreference.mock.calls[0][0].items[0].unit_price).toBe(2000);
  });

  it("accepts custom whole-peso amounts within bounds only", () => {
    expect(donationCheckoutSchema.safeParse({ amount: 1 }).success).toBe(false);
    expect(donationCheckoutSchema.safeParse({ amount: 1500.5 }).success).toBe(false);
    expect(donationCheckoutSchema.safeParse({ amount: 2_000_000 }).success).toBe(false);
    expect(donationCheckoutSchema.safeParse({ amount: 1500 }).success).toBe(true);
  });

  it("rate limits per IP", async () => {
    const { controller, mp } = make(false);
    await expect(controller.checkout(req, { amount: 1000 })).rejects.toThrow();
    expect(mp.createPreference).not.toHaveBeenCalled();
  });

  it("is disabled without Mercado Pago credentials", async () => {
    const rateLimit = { check: vi.fn() };
    const controller = new DonationsController(null, rateLimit as unknown as RateLimitService);
    await expect(controller.checkout(req, { amount: 1000 })).rejects.toThrow();
  });
});
