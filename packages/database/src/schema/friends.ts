import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";

export const friendships = sqliteTable("friendships", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lowerUserId: text("lower_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  upperUserId: text("upper_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["PENDING", "ACCEPTED", "CLOSED"] }).notNull(),
  // Once a contact was made through an alias, this relationship must not disclose their real id.
  lowerAliasOnly: integer("lower_alias_only", { mode: "boolean" }).notNull().default(false),
  upperAliasOnly: integer("upper_alias_only", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, table => [
  uniqueIndex("friendships_pair_unique").on(table.lowerUserId, table.upperUserId),
  index("friendships_lower_status").on(table.lowerUserId, table.status),
  index("friendships_upper_status").on(table.upperUserId, table.status),
  check("friendships_ordered_pair", sql`${table.lowerUserId} < ${table.upperUserId}`),
  check("friendships_sender_member", sql`${table.requestedBy} IN (${table.lowerUserId}, ${table.upperUserId})`),
  check("friendships_status", sql`${table.status} IN ('PENDING', 'ACCEPTED', 'CLOSED')`),
]);
