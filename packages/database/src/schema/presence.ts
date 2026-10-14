import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { rooms } from "./rooms.js";
import { user } from "./auth.js";

export const userRoomPresence = sqliteTable(
  "user_room_presence",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    presenceVerified: integer("presence_verified", { mode: "boolean" }).notNull().default(false),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roomId] })],
);

// Scaffold only — populated in a later phase.
export const studyStatus = sqliteTable(
  "study_status",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    subject: text("subject"),
    message: text("message"),
    lookingForGroup: integer("looking_for_group", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(false),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roomId] }),
    index("idx_study_status_room_active")
      .on(table.roomId)
      .where(sql`active = 1`),
  ],
);

/**
 * Server-side proof that a user's GPS fix passed the room's geofence recently: presence-sensitive
 * writes from the same user in the same room are accepted without new coordinates until
 * `expires_at`. Issued only by `PresenceService` on a valid fix; never extended without one.
 */
export const presenceGrants = sqliteTable(
  "presence_grants",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    grantedAt: integer("granted_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roomId] })],
);
