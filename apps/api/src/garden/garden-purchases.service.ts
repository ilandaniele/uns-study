import { desc, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import {
  GARDEN_SEED_PACK,
  type GardenCheckoutDto,
  type GardenShopDto,
} from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import type { Clock } from "../platform/clock.js";
import type { MercadoPagoClient } from "../subscriptions/mercadopago.client.js";
import type { GardenService } from "./garden.service.js";

export class GardenPurchasesService {
  constructor(
    private readonly db: Db,
    private readonly garden: GardenService,
    private readonly clock: Clock,
    private readonly mp: MercadoPagoClient | null,
    private readonly config: { webhookEnabled: boolean; webUrl: string },
  ) {}

  get enabled(): boolean {
    return !!this.mp && this.config.webhookEnabled;
  }

  shop(userId: string): GardenShopDto {
    const orders = this.db
      .select()
      .from(schema.gardenOrders)
      .where(eq(schema.gardenOrders.userId, userId))
      .orderBy(desc(schema.gardenOrders.createdAt))
      .limit(5)
      .all();
    const payments = orders.length
      ? this.db
          .select()
          .from(schema.gardenPayments)
          .where(
            inArray(
              schema.gardenPayments.orderId,
              orders.map((o) => o.id),
            ),
          )
          .all()
      : [];
    return {
      enabled: this.enabled,
      pack: GARDEN_SEED_PACK,
      orders: orders.map((o) => {
        const paid = payments.filter((p) => p.orderId === o.id);
        const creditedSeeds = paid.reduce((sum, p) => sum + p.creditedSeeds, 0);
        return {
          id: o.id,
          createdAt: o.createdAt.toISOString(),
          status:
            creditedSeeds > 0 ? "approved" : (paid.at(-1)?.status ?? "pending"),
          creditedSeeds,
        };
      }),
    };
  }

  async checkout(userId: string): Promise<GardenCheckoutDto> {
    if (!this.enabled || !this.mp)
      throw ApiErrors.featureDisabled(
        "Las compras de semillas todavía no están habilitadas.",
      );
    const id = crypto.randomUUID();
    this.db
      .insert(schema.gardenOrders)
      .values({ id, userId, ...GARDEN_SEED_PACK, createdAt: this.clock.now() })
      .run();
    const back = `${this.config.webUrl}/jardin?compra=pendiente`;
    const preference = await this.mp.createPreference({
      items: [
        {
          title: "100 semillas virtuales · Sala de Estudio",
          quantity: 1,
          unit_price: GARDEN_SEED_PACK.priceArs,
          currency_id: "ARS",
        },
      ],
      external_reference: `garden:${id}`,
      notification_url: `${this.config.webUrl}/api/v1/webhooks/mercadopago`,
      back_urls: {
        success: back,
        pending: back,
        failure: `${this.config.webUrl}/jardin?compra=cancelada`,
      },
      auto_return: "approved",
      statement_descriptor: "SALA ESTUDIO",
    });
    this.db
      .update(schema.gardenOrders)
      .set({ preferenceId: preference.id })
      .where(eq(schema.gardenOrders.id, id))
      .run();
    return { initPoint: preference.init_point };
  }

  /** Signed webhook only: re-fetch payment; redirect parameters cannot award any seeds. */
  async handlePayment(paymentId: string): Promise<void> {
    if (!this.mp) return;
    const payment = await this.mp.getPayment(paymentId);
    if (
      String(payment.id) !== paymentId ||
      !payment.external_reference?.startsWith("garden:")
    )
      return;
    const orderId = payment.external_reference.slice(7);
    this.db.transaction((tx) => {
      const order = tx
        .select()
        .from(schema.gardenOrders)
        .where(eq(schema.gardenOrders.id, orderId))
        .get();
      if (
        !order ||
        payment.currency_id !== "ARS" ||
        payment.transaction_amount !== order.priceArs
      )
        return;
      const prior = tx
        .select()
        .from(schema.gardenPayments)
        .where(eq(schema.gardenPayments.paymentId, paymentId))
        .get();
      if (prior && prior.orderId !== orderId) return;
      const updatedAt = payment.date_last_updated
        ? new Date(payment.date_last_updated)
        : this.clock.now();
      if (!Number.isFinite(updatedAt.getTime()))
        throw new Error("Invalid payment update date");
      // A slower webhook must not restore credit after a newer refund notification.
      if (prior && prior.updatedAt.getTime() > updatedAt.getTime()) return;
      const refunded = Math.min(
        order.priceArs,
        Math.max(0, payment.transaction_amount_refunded ?? 0),
      );
      const credit =
        payment.status === "approved"
          ? Math.floor(
              (order.seeds * (order.priceArs - refunded)) / order.priceArs,
            )
          : 0;
      if (prior?.creditedSeeds === credit && prior.status === payment.status)
        return;
      const delta = credit - (prior?.creditedSeeds ?? 0);
      if (delta) this.garden.adjustPurchaseCredit(tx, order.userId, delta);
      tx.insert(schema.gardenPayments)
        .values({
          paymentId,
          orderId,
          creditedSeeds: credit,
          status: payment.status,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: schema.gardenPayments.paymentId,
          set: { creditedSeeds: credit, status: payment.status, updatedAt },
        })
        .run();
    });
  }
}
