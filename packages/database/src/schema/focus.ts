import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";

/** Personal timer only. Never a source of verified study time, seeds or rankings. */
export const userFocus = sqliteTable("user_focus", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  state: text("state").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
