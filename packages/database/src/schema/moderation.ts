import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { rooms } from "./rooms.js";
import { user } from "./auth.js";

export const reportReasonEnum = { enumValues: [
  "SPAM",
  "HARASSMENT",
  "INAPPROPRIATE_BEHAVIOR",
  "IMPERSONATION",
  "SEAT_TROLLING",
  "OFFENSIVE_CONTENT",
  "OTHER",
] as const };
export const reportContextEnum = { enumValues: ["PROFILE", "CHAT", "DM"] as const };
export const reportStatusEnum = { enumValues: ["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"] as const };
export const reportAttachmentStatusEnum = { enumValues: ["PENDING", "UPLOADED"] as const };
export const restrictionTypeEnum = { enumValues: ["MUTE_CHAT", "RESTRICT_OBSERVATIONS", "SUSPENDED", "BANNED"] as const };

export const userBlocks = sqliteTable(
  "user_blocks",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    check("chk_user_blocks_not_self", sql`${table.blockerId} <> ${table.blockedId}`),
    index("idx_user_blocks_blocked").on(table.blockedId),
  ],
);

export const userReports = sqliteTable(
  "user_reports",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    reportedUserId: text("reported_user_id").references(() => user.id, { onDelete: "set null" }),
    roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
    reason: text("reason", { enum: reportReasonEnum.enumValues }).notNull(),
    description: text("description"),
    context: text("context", { enum: reportContextEnum.enumValues }).notNull(),
    contextMessageId: text("context_message_id"),
    status: text("status", { enum: reportStatusEnum.enumValues }).notNull().default("OPEN"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("idx_user_reports_status_created").on(table.status, table.createdAt),
    index("idx_user_reports_reporter_created").on(table.reporterId, table.createdAt),
    index("idx_user_reports_created").on(sql`${table.createdAt} desc`),
  ],
);

export const userReportAttachments = sqliteTable(
  "user_report_attachments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    reportId: text("report_id")
      .notNull()
      .references(() => userReports.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: reportAttachmentStatusEnum.enumValues }).notNull().default("PENDING"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_user_report_attachments_report").on(table.reportId),
    index("idx_user_report_attachments_status_created").on(table.status, table.createdAt),
  ],
);

export const userRestrictions = sqliteTable(
  "user_restrictions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: restrictionTypeEnum.enumValues }).notNull(),
    reason: text("reason").notNull(),
    until: integer("until", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    liftedAt: integer("lifted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("idx_user_restrictions_user").on(table.userId)],
);

export const moderationActions = sqliteTable(
  "moderation_actions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    targetUserId: text("target_user_id").references(() => user.id, { onDelete: "set null" }),
    reportId: text("report_id").references(() => userReports.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<unknown>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("idx_moderation_actions_created").on(sql`${table.createdAt} desc`)],
);

export const announcements = sqliteTable(
  "announcements",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text("room_id").references(() => rooms.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("idx_announcements_room_starts").on(table.roomId, table.startsAt)],
);
