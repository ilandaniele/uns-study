import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { SubscriptionCheckoutDto, SubscriptionDto, SubscriptionStatus } from "@sala/contracts";
import type { RequestUser } from "../http/context.js";
import { ApiErrors } from "../common/api-error.js";
import { env } from "../env.js";
import { MpHttpError, type MercadoPagoClient, type MpPreapproval } from "./mercadopago.client.js";

/** The subset of `MercadoPagoClient` the service uses (lets tests pass a fake). */
export type MpClientLike = Pick<MercadoPagoClient, "createPreapproval" | "getPreapproval" | "getAuthorizedPayment" | "cancelPreapproval">;

const KNOWN_STATUSES: readonly string[] = ["pending", "authorized", "paused", "cancelled"];

function toStatus(raw: string): SubscriptionStatus | null {
  return KNOWN_STATUSES.includes(raw) ? (raw as SubscriptionStatus) : null;
}

/** An "authorized" preapproval only counts if its terms are the ones we offer (the payer controls the MP checkout). */
function hasExpectedTerms(pre: MpPreapproval): boolean {
  const r = pre.auto_recurring;
  return (
    r?.currency_id === "ARS" &&
    r.frequency === 1 &&
    r.frequency_type === "months" &&
    typeof r.transaction_amount === "number" &&
    r.transaction_amount >= env.subscriptionPriceArs
  );
}

type Decision = { action: "skip" } | { action: "cancel-new" } | { action: "apply"; cancelOld?: string };

/** What an incoming preapproval (`id`, `status`) should do given the stored row. */
function decide(stored: typeof schema.userSubscriptions.$inferSelect | undefined, id: string, status: string): Decision {
  if (!stored || stored.providerSubscriptionId === id) return { action: "apply" };
  // A stale notification for an older, abandoned preapproval must not revoke an active one.
  if (stored.status === "authorized" && status !== "authorized") return { action: "skip" };
  if (status === "authorized") {
    // Keep the live one; the newcomer must not bill too.
    if (stored.status === "authorized") return { action: "cancel-new" };
    if (stored.status !== "cancelled") return { action: "apply", cancelOld: stored.providerSubscriptionId };
  }
  return { action: "apply" };
}

/** Ad-free subscription backed by a Mercado Pago preapproval. MP is canonical; we mirror its state. */
export class SubscriptionsService {
  constructor(
    private readonly db: Db,
    private readonly mp: MpClientLike | null,
  ) {}

  async getForUser(userId: string): Promise<SubscriptionDto> {
    const [row] = await this.db.select().from(schema.userSubscriptions).where(eq(schema.userSubscriptions.userId, userId));
    return {
      enabled: Boolean(this.mp),
      priceArs: env.subscriptionPriceArs,
      status: row ? toStatus(row.status) : null,
      currentPeriodEnd: row?.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
    };
  }

  async checkout(user: RequestUser): Promise<SubscriptionCheckoutDto> {
    if (!this.mp) throw ApiErrors.featureDisabled();
    const current = await this.getForUser(user.id);
    if (current.status === "authorized") throw ApiErrors.validation("Ya tenés la suscripción activa.");

    // A previous unfinished preapproval could still be authorized later: close it so only one can bill.
    const [previous] = await this.db.select().from(schema.userSubscriptions).where(eq(schema.userSubscriptions.userId, user.id));
    if (previous && previous.status !== "cancelled" && previous.providerSubscriptionId) {
      await this.cancelQuietly(previous.providerSubscriptionId);
    }

    const pre = await this.mp.createPreapproval({
      reason: "Sala de Estudio sin anuncios",
      external_reference: user.id,
      payer_email: user.email,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: env.subscriptionPriceArs,
        currency_id: "ARS",
      },
      back_url: `${env.publicWebUrl}/suscripcion?estado=ok`,
      status: "pending",
    });
    if (!pre.init_point) throw new Error("Mercado Pago did not return an init_point");

    await this.db
      .insert(schema.userSubscriptions)
      .values({ userId: user.id, providerSubscriptionId: pre.id, status: "pending", currentPeriodEnd: null })
      .onConflictDoUpdate({
        target: schema.userSubscriptions.userId,
        set: { providerSubscriptionId: pre.id, status: "pending", currentPeriodEnd: null, updatedAt: new Date() },
      });
    return { initPoint: pre.init_point };
  }

  async cancel(userId: string): Promise<SubscriptionDto> {
    if (!this.mp) throw ApiErrors.featureDisabled();
    const [row] = await this.db.select().from(schema.userSubscriptions).where(eq(schema.userSubscriptions.userId, userId));
    if (row && row.status !== "cancelled") {
      const pre = await this.mp.cancelPreapproval(row.providerSubscriptionId);
      await this.db
        .update(schema.userSubscriptions)
        .set({ status: pre.status || "cancelled", updatedAt: new Date() })
        .where(eq(schema.userSubscriptions.userId, userId));
    }
    return this.getForUser(userId);
  }

  async handleWebhook(input: { type: string | undefined; dataId: string }): Promise<void> {
    if (!this.mp) throw ApiErrors.featureDisabled();
    let pre: MpPreapproval;
    if (input.type === "subscription_preapproval") {
      pre = await this.mp.getPreapproval(input.dataId);
    } else if (input.type === "subscription_authorized_payment") {
      const payment = await this.mp.getAuthorizedPayment(input.dataId);
      pre = await this.mp.getPreapproval(payment.preapproval_id);
    } else {
      return;
    }
    await this.applyPreapproval(pre);
  }

  /** Mirrors an MP preapproval onto the owning user's row. Exported for tests. */
  async applyPreapproval(pre: MpPreapproval): Promise<void> {
    const userId = pre.external_reference;
    if (!userId) return;
    const periodEnd = pre.next_payment_date ? new Date(pre.next_payment_date) : null;
    const currentPeriodEnd = periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd : null;

    const status = pre.status === "authorized" && !hasExpectedTerms(pre) ? "pending" : pre.status;

    // Decide against the stored row first, run the Mercado Pago cancels (external I/O) outside any
    // transaction, then re-read and write in one sync transaction.
    const [owner] = await this.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId));
    if (!owner) return;
    const [seen] = await this.db.select().from(schema.userSubscriptions).where(eq(schema.userSubscriptions.userId, userId));
    const first = decide(seen, pre.id, status);
    if (first.action === "skip") return;
    if (first.action === "cancel-new") {
      // Keep the live one; the newcomer must not bill too.
      await this.cancelQuietly(pre.id);
      return;
    }
    if (first.cancelOld) await this.cancelQuietly(first.cancelOld);

    this.db.transaction((tx) => {
      const [stillOwner] = tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).all();
      if (!stillOwner) return;
      const [stored] = tx.select().from(schema.userSubscriptions).where(eq(schema.userSubscriptions.userId, userId)).all();
      // The row changed while the cancel was in flight: the webhook retry re-evaluates it.
      if (decide(stored, pre.id, status).action !== "apply") return;

      tx.insert(schema.userSubscriptions)
        .values({ userId, providerSubscriptionId: pre.id, status, currentPeriodEnd })
        .onConflictDoUpdate({
          target: schema.userSubscriptions.userId,
          set: { providerSubscriptionId: pre.id, status, currentPeriodEnd, updatedAt: new Date() },
        })
        .run();
    });
  }

  /** Cancels a preapproval at MP; 404 (already gone) is fine, anything else throws so the caller retries. */
  private async cancelQuietly(id: string): Promise<void> {
    try {
      await this.mp!.cancelPreapproval(id);
    } catch (err) {
      if (err instanceof MpHttpError && err.status === 404) return;
      throw err;
    }
  }
}
