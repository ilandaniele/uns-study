import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { freshDb, insertUsers } from "../test-utils.js";
import type { RequestUser } from "../auth/request-user.js";
import { env } from "../env.js";
import { MpHttpError, type MpPreapproval } from "./mercadopago.client.js";
import { SubscriptionsService, type MpClientLike } from "./subscriptions.service.js";

const TERMS = { transaction_amount: env.subscriptionPriceArs, currency_id: "ARS", frequency: 1, frequency_type: "months" };

function fakeClient(over: Partial<MpClientLike> = {}) {
  return {
    createPreapproval: vi.fn(async () => ({ id: "pre-1", status: "pending", external_reference: "u1", init_point: "https://mp.test/checkout" })),
    getPreapproval: vi.fn(async (id: string) => ({ id, status: "authorized", external_reference: "u1", auto_recurring: TERMS }) as MpPreapproval),
    getAuthorizedPayment: vi.fn(async () => ({ preapproval_id: "pre-1" })),
    cancelPreapproval: vi.fn(async (id: string) => ({ id, status: "cancelled", external_reference: "u1" }) as MpPreapproval),
    ...over,
  } satisfies MpClientLike;
}

const authed = (id: string, status = "authorized", next?: string): MpPreapproval => ({
  id,
  status,
  external_reference: "u1",
  next_payment_date: next ?? null,
  auto_recurring: TERMS,
});

describe("SubscriptionsService", () => {
  let db: Db;
  let client: ReturnType<typeof fakeClient>;
  let svc: SubscriptionsService;
  const user: RequestUser = { id: "u1", name: "u1", email: "u1@example.test", image: null };

  beforeEach(async () => {
    db = await freshDb();
    await insertUsers(db, ["u1"]);
    client = fakeClient();
    svc = new SubscriptionsService(db, client);
  });

  it("an authorized preapproval upserts the row and reports the period end", async () => {
    await svc.applyPreapproval(authed("pre-1", "authorized", "2026-11-01T00:00:00.000Z"));
    const dto = await svc.getForUser("u1");
    expect(dto).toMatchObject({ enabled: true, status: "authorized", currentPeriodEnd: "2026-11-01T00:00:00.000Z" });
    const [row] = await db.select().from(schema.userSubscriptions).where(eq(schema.userSubscriptions.userId, "u1"));
    expect(row?.status).toBe("authorized");
  });

  it("a later cancelled status flips it", async () => {
    await svc.applyPreapproval(authed("pre-1"));
    await svc.applyPreapproval(authed("pre-1", "cancelled"));
    expect((await svc.getForUser("u1")).status).toBe("cancelled");
  });

  it("an unknown MP status maps to null", async () => {
    await svc.applyPreapproval(authed("pre-1", "weird"));
    expect((await svc.getForUser("u1")).status).toBeNull();
  });

  it("ignores a stale non-authorized notification for a different preapproval", async () => {
    await svc.applyPreapproval(authed("pre-new"));
    await svc.applyPreapproval(authed("pre-old", "cancelled"));
    const [row] = await db.select().from(schema.userSubscriptions).where(eq(schema.userSubscriptions.userId, "u1"));
    expect(row).toMatchObject({ providerSubscriptionId: "pre-new", status: "authorized" });
  });

  it("is a no-op for an unknown external_reference", async () => {
    await svc.applyPreapproval({ id: "pre-x", status: "authorized", external_reference: "ghost", auto_recurring: TERMS });
    await svc.applyPreapproval({ id: "pre-y", status: "authorized", external_reference: null, auto_recurring: TERMS });
    expect(await db.select().from(schema.userSubscriptions)).toHaveLength(0);
  });

  it("resolves an authorized_payment notification through to the preapproval", async () => {
    await svc.handleWebhook({ type: "subscription_authorized_payment", dataId: "pay-9" });
    expect(client.getAuthorizedPayment).toHaveBeenCalledWith("pay-9");
    expect(client.getPreapproval).toHaveBeenCalledWith("pre-1");
    expect((await svc.getForUser("u1")).status).toBe("authorized");
  });

  it("ignores other webhook types", async () => {
    await svc.handleWebhook({ type: "payment", dataId: "1" });
    expect(client.getPreapproval).not.toHaveBeenCalled();
  });

  it("checkout sends the exact body and stores a pending row", async () => {
    const out = await svc.checkout(user);
    expect(out).toEqual({ initPoint: "https://mp.test/checkout" });
    expect(client.createPreapproval).toHaveBeenCalledWith({
      reason: "Sala de Estudio sin anuncios",
      external_reference: "u1",
      payer_email: "u1@example.test",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: env.subscriptionPriceArs, currency_id: "ARS" },
      back_url: `${env.publicWebUrl}/suscripcion?estado=ok`,
      status: "pending",
    });
    expect((await svc.getForUser("u1")).status).toBe("pending");
  });

  it("checkout rejects an already authorized user", async () => {
    await svc.applyPreapproval(authed("pre-1"));
    await expect(svc.checkout(user)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("checkout cancels a previous unfinished preapproval before creating a new one", async () => {
    await svc.applyPreapproval(authed("pre-old", "pending"));
    await svc.checkout(user);
    expect(client.cancelPreapproval).toHaveBeenCalledWith("pre-old");
    expect(vi.mocked(client.cancelPreapproval).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(client.createPreapproval).mock.invocationCallOrder[0]!);
  });

  it("checkout tolerates a 404 on the old cancel but aborts on other errors", async () => {
    await svc.applyPreapproval(authed("pre-old", "pending"));
    vi.mocked(client.cancelPreapproval).mockRejectedValueOnce(new MpHttpError("gone", 404));
    await expect(svc.checkout(user)).resolves.toEqual({ initPoint: "https://mp.test/checkout" });

    await svc.applyPreapproval(authed("pre-old2", "pending"));
    vi.mocked(client.createPreapproval).mockClear();
    vi.mocked(client.cancelPreapproval).mockRejectedValueOnce(new MpHttpError("boom", 500));
    await expect(svc.checkout(user)).rejects.toThrow("boom");
    expect(client.createPreapproval).not.toHaveBeenCalled();
  });

  it("a second authorized preapproval is cancelled when the stored one is already authorized", async () => {
    await svc.applyPreapproval(authed("pre-1"));
    await svc.applyPreapproval(authed("pre-2"));
    expect(client.cancelPreapproval).toHaveBeenCalledWith("pre-2");
    const [row] = await db.select().from(schema.userSubscriptions).where(eq(schema.userSubscriptions.userId, "u1"));
    expect(row).toMatchObject({ providerSubscriptionId: "pre-1", status: "authorized" });
  });

  it("an authorized preapproval replaces a pending stored one, which gets cancelled", async () => {
    await svc.applyPreapproval(authed("pre-1", "pending"));
    await svc.applyPreapproval(authed("pre-2"));
    expect(client.cancelPreapproval).toHaveBeenCalledWith("pre-1");
    const [row] = await db.select().from(schema.userSubscriptions).where(eq(schema.userSubscriptions.userId, "u1"));
    expect(row).toMatchObject({ providerSubscriptionId: "pre-2", status: "authorized" });
  });

  it("an authorized preapproval with unexpected terms is not treated as authorized", async () => {
    const bad = [
      { ...TERMS, currency_id: "USD" },
      { ...TERMS, frequency: 12 },
      { ...TERMS, frequency_type: "days" },
      { ...TERMS, transaction_amount: env.subscriptionPriceArs - 1 },
    ];
    for (const auto_recurring of bad) {
      await svc.applyPreapproval({ ...authed("pre-1"), auto_recurring });
      expect((await svc.getForUser("u1")).status).not.toBe("authorized");
    }
    await svc.applyPreapproval({ ...authed("pre-1"), auto_recurring: undefined });
    expect((await svc.getForUser("u1")).status).not.toBe("authorized");
  });

  it("checkout throws featureDisabled without a token", async () => {
    const disabled = new SubscriptionsService(db, null);
    await expect(disabled.checkout(user)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect((await disabled.getForUser("u1")).enabled).toBe(false);
  });

  it("cancel cancels at MP and mirrors the status", async () => {
    await svc.applyPreapproval(authed("pre-1"));
    const dto = await svc.cancel("u1");
    expect(client.cancelPreapproval).toHaveBeenCalledWith("pre-1");
    expect(dto.status).toBe("cancelled");
  });
});
