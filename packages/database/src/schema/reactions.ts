import { sql } from "drizzle-orm";
import {
  check,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";
import { chatMessages, directMessages } from "./chat.js";
import { groupMessages } from "./groups.js";

export const messageReactions = sqliteTable(
  "message_reactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chatMessageId: text("chat_message_id").references(() => chatMessages.id, {
      onDelete: "cascade",
    }),
    directMessageId: text("direct_message_id").references(
      () => directMessages.id,
      { onDelete: "cascade" },
    ),
    groupMessageId: text("group_message_id").references(
      () => groupMessages.id,
      { onDelete: "cascade" },
    ),
    emoji: text("emoji").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    check(
      "chk_reaction_one_message",
      sql`(${t.chatMessageId} is not null) + (${t.directMessageId} is not null) + (${t.groupMessageId} is not null) = 1`,
    ),
    uniqueIndex("uq_reaction_chat_user").on(t.chatMessageId, t.userId),
    uniqueIndex("uq_reaction_direct_user").on(t.directMessageId, t.userId),
    uniqueIndex("uq_reaction_group_user").on(t.groupMessageId, t.userId),
  ],
);
