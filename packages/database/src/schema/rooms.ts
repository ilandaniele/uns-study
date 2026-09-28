import { boolean, doublePrecision, index, integer, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const tableTypeEnum = pgEnum("table_type", ["MAIN_TABLE", "WALL_BAR"]);
export const seatStatusEnum = pgEnum("seat_status", ["UNKNOWN", "FREE", "OCCUPIED", "UNCERTAIN"]);

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  geofenceRadiusM: integer("geofence_radius_m").notNull(),
  timezone: text("timezone").notNull(),
  dailyResetTime: text("daily_reset_time").notNull(), // 'HH:MM'
  active: boolean("active").notNull().default(true),
  lastResetAt: timestamp("last_reset_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roomTables = pgTable(
  "room_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull(),
    type: tableTypeEnum("type").notNull(),
    /** Community-voted nickname (see `table-names.ts`), null until a proposal crosses the threshold. */
    nickname: text("nickname"),
    x: real("x").notNull(),
    y: real("y").notNull(),
    width: real("width").notNull(),
    height: real("height").notNull(),
    rotation: real("rotation").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uq_room_tables_room_code").on(table.roomId, table.code)],
);

export const seats = pgTable(
  "seats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    tableId: uuid("table_id")
      .notNull()
      .references(() => roomTables.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    seatNumber: integer("seat_number").notNull(),
    x: real("x").notNull(),
    y: real("y").notNull(),
    rotation: real("rotation").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_seats_room_code").on(table.roomId, table.code),
    index("idx_seats_room_id").on(table.roomId),
  ],
);

export const seatCurrentState = pgTable(
  "seat_current_state",
  {
    seatId: uuid("seat_id")
      .primaryKey()
      .references(() => seats.id, { onDelete: "cascade" }),
    status: seatStatusEnum("status").notNull().default("UNKNOWN"),
    confidence: real("confidence").notNull().default(0),
    sourceSummary: text("source_summary"),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_seat_current_state_status").on(table.status)],
);
