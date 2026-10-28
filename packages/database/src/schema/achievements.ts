import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";
import { rooms, seats } from "./rooms.js";

/** At most one rewarded update of each seat per person and local day. Independent of report expiry. */
export const collaborationUpdates = sqliteTable("collaboration_updates", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  localDate: text("local_date").notNull(),
  seatId: text("seat_id").notNull().references(() => seats.id, { onDelete: "cascade" }),
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, t => [primaryKey({ columns: [t.userId, t.localDate, t.seatId] })]);

export const userAchievements = sqliteTable("user_achievements", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  badgeId: text("badge_id").notNull(),
  earnedAt: integer("earned_at", { mode: "timestamp_ms" }).notNull(),
  seenAt: integer("seen_at", { mode: "timestamp_ms" }),
}, t => [primaryKey({ columns: [t.userId, t.badgeId] })]);

/** Reaching a milestone never grants staff privileges. Only the superadmin may approve a request. */
export const adminApplications = sqliteTable("admin_applications", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED"] }).notNull(),
  requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull(),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
}, t => [index("idx_admin_applications_status").on(t.status)]);
