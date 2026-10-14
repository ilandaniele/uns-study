import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { rooms, seats } from "./rooms.js";
import { user } from "./auth.js";

export const observedStatusEnum = { enumValues: ["FREE", "OCCUPIED", "SAVED"] as const };

export const seatObservations = sqliteTable(
  "seat_observations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    seatId: text("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "cascade" }),
    observedStatus: text("observed_status", { enum: observedStatusEnum.enumValues }).notNull(),
    presenceVerified: integer("presence_verified", { mode: "boolean" }).notNull().default(false),
    qrVerified: integer("qr_verified", { mode: "boolean" }).notNull().default(false),
    /** Set by "Todos los lugares ocupados": an admin bulk-marked this seat; shown as "Administración". */
    adminOverride: integer("admin_override", { mode: "boolean" }).notNull().default(false),
    confidenceWeight: real("confidence_weight").notNull().default(1),
    observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_seat_observations_seat_expires").on(table.seatId, table.expiresAt),
    index("idx_seat_observations_user_created").on(table.userId, table.createdAt),
    index("idx_seat_observations_room_expires").on(table.roomId, table.expiresAt),
    index("idx_seat_observations_room_created").on(table.roomId, table.createdAt),
  ],
);

export const seatStateEvents = sqliteTable(
  "seat_state_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    seatId: text("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    oldStatus: text("old_status"),
    newStatus: text("new_status"),
    metadata: text("metadata", { mode: "json" }).$type<unknown>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("idx_seat_state_events_room_created").on(table.roomId, sql`${table.createdAt} desc`)],
);
