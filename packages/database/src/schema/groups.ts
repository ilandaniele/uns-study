import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export const groupConversations = pgTable("group_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 60 }).notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groupConversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["OWNER", "MEMBER"] }).notNull().default("MEMBER"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("idx_group_members_user").on(t.userId),
    check("chk_group_members_role", sql`${t.role} in ('OWNER','MEMBER')`),
  ],
);

export const groupMessages = pgTable(
  "group_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groupConversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: varchar("content", { length: 1000 }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_group_messages_group_created").on(t.groupId, t.createdAt.desc())],
);
