import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

/**
 * Per-user opt-in switches for realtime alerts (§ notifications). Both default `false` — like
 * privacy, nothing is sent unless the user explicitly turns it on. One row per user, upserted
 * lazily on first read/write (same pattern as `user_privacy_settings`).
 */
export const notificationPreferences = pgTable("notification_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  seatFreed: boolean("seat_freed").notNull().default(false),
  adminPresent: boolean("admin_present").notNull().default(false),
  // Unlike the two above this one defaults ON: it only ever concerns the user's own seat.
  checkinExpiry: boolean("checkin_expiry").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per subscribed device/browser (`PushSubscription` from the Web Push API). `endpoint` is
 * unique across all users — the same endpoint can't be registered twice, and re-subscribing (e.g.
 * after a key rotation) upserts in place. Never log `p256dh`/`auth` — they're the device's push
 * decryption keys.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    // Consecutive delivery failures that weren't a clean 404/410 (those delete the row outright) —
    // reset to 0 on any successful delivery, and the row is deleted once this hits 3 so a
    // permanently-broken subscription (bad keys, encryption errors, ...) doesn't get retried forever.
    failureCount: integer("failure_count").notNull().default(0),
  },
  (table) => [uniqueIndex("uq_push_subscriptions_endpoint").on(table.endpoint), index("idx_push_subscriptions_user").on(table.userId)],
);

/**
 * Last time a given user was sent a push of a given type — the throttle NotificationService reads
 * before sending another one (e.g. at most 1 "seat freed" push per user per 10 minutes). `type` is
 * a short free-text tag ("SEAT_FREED", "ADMIN_PRESENT") rather than an enum, kept intentionally
 * loose since new alert types are expected to be added over time.
 */
export const notificationThrottles = pgTable(
  "notification_throttles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.type] })],
);
