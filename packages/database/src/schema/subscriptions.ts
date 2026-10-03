import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

/**
 * One row per user: their ad-free subscription (Mercado Pago preapproval). `status` stores the raw
 * provider status; the app only treats "authorized" as ad-free. Always re-fetched from the provider
 * by the webhook, never trusted from the notification payload.
 */
export const userSubscriptions = pgTable(
  "user_subscriptions",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("mercadopago"),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    status: text("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_user_subscriptions_provider_id").on(t.providerSubscriptionId)],
);
