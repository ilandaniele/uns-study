import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { FixedClock } from "../platform/clock.js";
import { freshDb, insertUsers } from "../test-utils.js";
import {
  MercadoPagoClient,
  type MpPayment,
  type MpPreferenceBody,
} from "../subscriptions/mercadopago.client.js";
import { GardenService } from "./garden.service.js";
import { GardenPurchasesService } from "./garden-purchases.service.js";

const NOW = new Date("2026-10-25T15:00:00Z");
describe("GardenPurchasesService", () => {
  let db: Db;
  let garden: GardenService;
  let shop: GardenPurchasesService;
  let mp: MercadoPagoClient;
  let body: MpPreferenceBody;
  let payment: MpPayment;
  beforeEach(async () => {
    db = freshDb();
    await insertUsers(db, ["u1", "u2"]);
    const clock = new FixedClock(NOW);
    garden = new GardenService(db, clock);
    mp = new MercadoPagoClient("synthetic-token");
    vi.spyOn(mp, "createPreference").mockImplementation(async (b) => {
      body = b;
      return {
        id: "pref-1",
        init_point: "https://www.mercadopago.com.ar/checkout/test",
      };
    });
    vi.spyOn(mp, "getPayment").mockImplementation(async () => payment);
    shop = new GardenPurchasesService(db, garden, clock, mp, {
      webhookEnabled: true,
      webUrl: "https://dev.example.test",
    });
  });
  async function checkout() {
    await shop.checkout("u1");
    payment = {
      id: "123",
      external_reference: body.external_reference!,
      status: "approved",
      currency_id: "ARS",
      transaction_amount: 5000,
      date_last_updated: NOW.toISOString(),
    };
  }
  it("fixes server terms, retains owner privately and awards nothing on checkout alone", async () => {
    await checkout();
    expect(body).toMatchObject({
      items: [{ quantity: 1, unit_price: 5000, currency_id: "ARS" }],
      notification_url: "https://dev.example.test/api/v1/webhooks/mercadopago",
      back_urls: {
        success: "https://dev.example.test/jardin?compra=pendiente",
      },
    });
    expect(body.external_reference).not.toContain("u1");
    expect((await garden.get("u1")).seeds).toBe(30);
    expect(shop.shop("u1").orders).toHaveLength(1);
    expect(shop.shop("u2").orders).toHaveLength(0);
  });
  it("credits a verified approval once, survives repeated/concurrent callbacks, and preserves the garden", async () => {
    await garden.plant("u1", { plot: 2, speciesId: "espinillo" });
    await checkout();
    await Promise.all([shop.handlePayment("123"), shop.handlePayment("123")]);
    expect(await garden.get("u1")).toMatchObject({
      seeds: 118,
      plants: [{ plot: 2 }],
    });
    expect(shop.shop("u1").orders[0]).toMatchObject({
      status: "approved",
      creditedSeeds: 100,
    });
    expect((await garden.get("u2")).seeds).toBe(30);
    expect(db.select().from(schema.gardenPayments).all()).toHaveLength(1);
  });
  it.each([
    { status: "pending" },
    { status: "rejected" },
    { currency_id: "USD" },
    { transaction_amount: 1 },
    { external_reference: "donation" },
    { external_reference: "garden:unknown" },
    { id: "another-payment" },
  ])(
    "does not credit unapproved or mismatched payment %j",
    async (override) => {
      await checkout();
      payment = { ...payment, ...override };
      await shop.handlePayment("123");
      expect((await garden.get("u1")).seeds).toBe(30);
    },
  );
  it("reverses partial refunds and chargebacks idempotently and ignores older notifications", async () => {
    await checkout();
    await shop.handlePayment("123");
    payment = {
      ...payment,
      transaction_amount_refunded: 2500,
      date_last_updated: "2026-10-25T16:00:00Z",
    };
    await shop.handlePayment("123");
    await shop.handlePayment("123");
    expect((await garden.get("u1")).seeds).toBe(80);
    payment = {
      ...payment,
      status: "charged_back",
      date_last_updated: "2026-10-25T17:00:00Z",
    };
    await shop.handlePayment("123");
    expect((await garden.get("u1")).seeds).toBe(30);
    payment = {
      ...payment,
      status: "approved",
      transaction_amount_refunded: 0,
      date_last_updated: "2026-10-25T15:00:00Z",
    };
    await shop.handlePayment("123");
    expect((await garden.get("u1")).seeds).toBe(30);
  });
  it("rolls back the balance if recording a provider receipt fails", async () => {
    await checkout();
    db.run(
      "CREATE TRIGGER reject_credit BEFORE INSERT ON garden_payments BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await expect(shop.handlePayment("123")).rejects.toThrow(
      "synthetic failure",
    );
    expect((await garden.get("u1")).seeds).toBe(30);
    expect(db.select().from(schema.gardenPayments).all()).toHaveLength(0);
  });
  it("disables checkout when webhook verification is unavailable and cascades account deletion", async () => {
    const disabled = new GardenPurchasesService(
      db,
      garden,
      new FixedClock(NOW),
      mp,
      { webhookEnabled: false, webUrl: "https://dev.example.test" },
    );
    await expect(disabled.checkout("u1")).rejects.toMatchObject({
      status: 503,
    });
    expect(mp.createPreference).not.toHaveBeenCalled();
    await checkout();
    await shop.handlePayment("123");
    db.delete(schema.user).where(eq(schema.user.id, "u1")).run();
    expect(db.select().from(schema.gardenOrders).all()).toHaveLength(0);
    expect(db.select().from(schema.gardenPayments).all()).toHaveLength(0);
  });
});
