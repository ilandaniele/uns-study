import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";

/**
 * Per-user opt-in switches for realtime alerts (§ notifications). Both default `false` — like
 * privacy, nothing is sent unless the user explicitly turns it on. One row per user, upserted
 * lazily on first read/write (same pattern as `user_privacy_settings`).
 */
export const notificationPreferences = sqliteTable(
  "notification_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    seatFreed: integer("seat_freed", { mode: "boolean" }).notNull().default(false),
    adminPresent: integer("admin_present", { mode: "boolean" }).notNull().default(false),
    // Unlike the two above this one defaults ON: it only ever concerns the user's own seat.
    checkinExpiry: integer("checkin_expiry", { mode: "boolean" }).notNull().default(true),
    // Opt-out model: admin email campaigns go to everyone who has not turned this off.
    marketingEmails: integer("marketing_emails", { mode: "boolean" }).notNull().default(true),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_notification_preferences_seat_freed")
      .on(table.userId)
      .where(sql`seat_freed = 1`),
    index("idx_notification_preferences_admin_present")
      .on(table.userId)
      .where(sql`admin_present = 1`),
  ],
);

/**
 * One row per subscribed device/browser (`PushSubscription` from the Web Push API). `endpoint` is
 * unique across all users — the same endpoint can't be registered twice, and re-subscribing (e.g.
 * after a key rotation) upserts in place. Never log `p256dh`/`auth` — they're the device's push
 * decryption keys.
 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    lastSuccessAt: integer("last_success_at", { mode: "timestamp_ms" }),
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
export const notificationThrottles = sqliteTable(
  "notification_throttles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    lastNotifiedAt: integer("last_notified_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.type] })],
);
