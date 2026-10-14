import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { rooms } from "./rooms.js";
import { user } from "./auth.js";

export const chatRooms = sqliteTable(
  "chat_rooms",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("uq_chat_rooms_room_slug").on(table.roomId, table.slug)],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    chatRoomId: text("chat_room_id")
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("idx_chat_messages_room_created").on(table.chatRoomId, sql`${table.createdAt} desc`)],
);

export const directConversations = sqliteTable(
  "direct_conversations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userA: text("user_a")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userB: text("user_b")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    check("chk_direct_conversations_ordered", sql`${table.userA} < ${table.userB}`),
    uniqueIndex("uq_direct_conversations_pair").on(table.userA, table.userB),
    index("idx_direct_conversations_user_a_last").on(table.userA, table.lastMessageAt),
    index("idx_direct_conversations_user_b_last").on(table.userB, table.lastMessageAt),
  ],
);

export const directMessages = sqliteTable(
  "direct_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => directConversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("idx_direct_messages_conversation_created").on(table.conversationId, sql`${table.createdAt} desc`)],
);

export const directConversationReads = sqliteTable(
  "direct_conversation_reads",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => directConversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastReadAt: integer("last_read_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.userId] })],
);
