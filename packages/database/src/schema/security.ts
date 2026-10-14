import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";

export const securityEvents = sqliteTable(
  "security_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    ipHash: text("ip_hash"),
    metadata: text("metadata", { mode: "json" }).$type<unknown>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("idx_security_events_user_created").on(table.userId, sql`${table.createdAt} desc`)],
);
