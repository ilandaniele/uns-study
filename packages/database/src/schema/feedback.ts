import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";

export const feedbackCategoryEnum = { enumValues: ["SUGGESTION", "CONCERN", "BUG", "OTHER"] as const };
export const feedbackStatusEnum = { enumValues: ["OPEN", "RESOLVED"] as const };

export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    category: text("category", { enum: feedbackCategoryEnum.enumValues }).notNull(),
    message: text("message").notNull(),
    contactEmail: text("contact_email"),
    ipHash: text("ip_hash"),
    status: text("status", { enum: feedbackStatusEnum.enumValues }).notNull().default("OPEN"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("idx_feedback_created_at").on(table.createdAt)],
);
