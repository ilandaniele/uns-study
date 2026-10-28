import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";

/** A bounded garden. Purchases, planting and expansion share one atomic balance. */
export const userGardens = sqliteTable("user_gardens", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  spentSeeds: integer("spent_seeds").notNull().default(0),
  bonusSeeds: integer("bonus_seeds").notNull().default(0),
  plotCount: integer("plot_count").notNull().default(25),
  landscapeSeed: integer("landscape_seed").notNull().default(0),
  shared: integer("shared", { mode: "boolean" }).notNull().default(false),
  plants: text("plants").notNull().default("[]"),
  collection: text("collection").notNull().default("{}"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const gardenOrders = sqliteTable(
  "garden_orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    seeds: integer("seeds").notNull(),
    priceArs: integer("price_ars").notNull(),
    preferenceId: text("preference_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("idx_garden_orders_user_created").on(t.userId, t.createdAt)],
);

/** Each provider payment has one credit, adjusted by deltas on refunds/chargebacks. */
export const gardenPayments = sqliteTable(
  "garden_payments",
  {
    paymentId: text("payment_id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => gardenOrders.id, { onDelete: "cascade" }),
    creditedSeeds: integer("credited_seeds").notNull(),
    status: text("status").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("idx_garden_payments_order").on(t.orderId)],
);

/** Durable idempotency receipt: it outlives audit-log retention and follows account deletion. */
export const gardenSeedGrants = sqliteTable("garden_seed_grants", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  seeds: integer("seeds").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
