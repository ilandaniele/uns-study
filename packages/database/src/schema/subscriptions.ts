import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";

/**
 * One row per user: their ad-free subscription (Mercado Pago preapproval). `status` stores the raw
 * provider status; the app only treats "authorized" as ad-free. Always re-fetched from the provider
 * by the webhook, never trusted from the notification payload.
 */
export const userSubscriptions = sqliteTable(
  "user_subscriptions",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("mercadopago"),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    status: text("status").notNull(),
    currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("uq_user_subscriptions_provider_id").on(t.providerSubscriptionId)],
);
