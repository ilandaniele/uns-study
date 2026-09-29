import { boolean, index, jsonb, pgEnum, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { rooms, seats } from "./rooms.js";
import { user } from "./auth.js";

export const observedStatusEnum = pgEnum("observed_status", ["FREE", "OCCUPIED"]);

export const seatObservations = pgTable(
  "seat_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "cascade" }),
    observedStatus: observedStatusEnum("observed_status").notNull(),
    presenceVerified: boolean("presence_verified").notNull().default(false),
    qrVerified: boolean("qr_verified").notNull().default(false),
    confidenceWeight: real("confidence_weight").notNull().default(1),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seat_observations_seat_expires").on(table.seatId, table.expiresAt),
    index("idx_seat_observations_user_created").on(table.userId, table.createdAt),
    index("idx_seat_observations_room_expires").on(table.roomId, table.expiresAt),
    index("idx_seat_observations_room_created").on(table.roomId, table.createdAt),
  ],
);

export const seatStateEvents = pgTable(
  "seat_state_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    oldStatus: text("old_status"),
    newStatus: text("new_status"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_seat_state_events_room_created").on(table.roomId, table.createdAt.desc())],
);
