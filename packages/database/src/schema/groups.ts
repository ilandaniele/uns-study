import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";

export const groupConversations = sqliteTable("group_conversations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
});

export const groupMembers = sqliteTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groupConversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["OWNER", "MEMBER"] }).notNull().default("MEMBER"),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    lastReadAt: integer("last_read_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("idx_group_members_user").on(t.userId),
    check("chk_group_members_role", sql`${t.role} in ('OWNER','MEMBER')`),
  ],
);

export const groupMessages = sqliteTable(
  "group_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => groupConversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_group_messages_group_created").on(t.groupId, sql`${t.createdAt} desc`)],
);
