import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";

/** Admin email campaigns. `status`: draft | sending | sent. */
export const emailCampaigns = sqliteTable("email_campaigns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  /** all | free | subscribers; see `email-recipients.ts`. */
  audience: text("audience").notNull().default("all"),
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  recipientCount: integer("recipient_count"),
});

/** One row per (campaign, recipient). `status`: pending | sent | failed; `claimed_at` is a lease. */
export const emailCampaignDeliveries = sqliteTable(
  "email_campaign_deliveries",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => emailCampaigns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    attempts: integer("attempts").notNull().default(0),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    error: text("error"),
    providerMessageId: text("provider_message_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("uq_email_deliveries_campaign_user").on(t.campaignId, t.userId),
    index("idx_email_deliveries_status").on(t.status, t.campaignId),
  ],
);
