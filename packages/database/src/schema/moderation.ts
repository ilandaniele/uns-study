import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { rooms } from "./rooms.js";
import { user } from "./auth.js";

export const reportReasonEnum = pgEnum("report_reason", [
  "SPAM",
  "HARASSMENT",
  "INAPPROPRIATE_BEHAVIOR",
  "IMPERSONATION",
  "SEAT_TROLLING",
  "OFFENSIVE_CONTENT",
  "OTHER",
]);
export const reportContextEnum = pgEnum("report_context", ["PROFILE", "CHAT", "DM"]);
export const reportStatusEnum = pgEnum("report_status", ["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"]);
export const reportAttachmentStatusEnum = pgEnum("report_attachment_status", ["PENDING", "UPLOADED"]);
export const restrictionTypeEnum = pgEnum("restriction_type", ["MUTE_CHAT", "RESTRICT_OBSERVATIONS", "SUSPENDED", "BANNED"]);

export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    check("chk_user_blocks_not_self", sql`${table.blockerId} <> ${table.blockedId}`),
  ],
);

export const userReports = pgTable(
  "user_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    reportedUserId: text("reported_user_id").references(() => user.id, { onDelete: "set null" }),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "set null" }),
    reason: reportReasonEnum("reason").notNull(),
    description: text("description"),
    context: reportContextEnum("context").notNull(),
    contextMessageId: uuid("context_message_id"),
    status: reportStatusEnum("status").notNull().default("OPEN"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("idx_user_reports_status_created").on(table.status, table.createdAt),
    index("idx_user_reports_reporter_created").on(table.reporterId, table.createdAt),
  ],
);

export const userReportAttachments = pgTable("user_report_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => userReports.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: reportAttachmentStatusEnum("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRestrictions = pgTable(
  "user_restrictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: restrictionTypeEnum("type").notNull(),
    reason: text("reason").notNull(),
    until: timestamp("until", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
  },
  (table) => [index("idx_user_restrictions_user").on(table.userId)],
);

export const moderationActions = pgTable("moderation_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  targetUserId: text("target_user_id").references(() => user.id, { onDelete: "set null" }),
  reportId: uuid("report_id").references(() => userReports.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  active: boolean("active").notNull().default(true),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
