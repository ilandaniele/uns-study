import { sql } from "drizzle-orm";
import { boolean, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { rooms } from "./rooms.js";
import { user } from "./auth.js";

export const userRoomPresence = pgTable(
  "user_room_presence",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    presenceVerified: boolean("presence_verified").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roomId] })],
);

// Scaffold only — populated in a later phase.
export const studyStatus = pgTable(
  "study_status",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    subject: text("subject"),
    message: text("message"),
    lookingForGroup: boolean("looking_for_group").notNull().default(false),
    active: boolean("active").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roomId] }),
    index("idx_study_status_room_active")
      .on(table.roomId)
      .where(sql`active`),
  ],
);

/**
 * Server-side proof that a user's GPS fix passed the room's geofence recently: presence-sensitive
 * writes from the same user in the same room are accepted without new coordinates until
 * `expires_at`. Issued only by `PresenceService` on a valid fix; never extended without one.
 */
export const presenceGrants = pgTable(
  "presence_grants",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roomId] })],
);
