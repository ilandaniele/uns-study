import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tableTypeEnum = { enumValues: ["MAIN_TABLE", "WALL_BAR"] as const };
export const seatStatusEnum = { enumValues: ["UNKNOWN", "FREE", "OCCUPIED", "UNCERTAIN", "SAVED"] as const };

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  geofenceRadiusM: integer("geofence_radius_m").notNull(),
  timezone: text("timezone").notNull(),
  dailyResetTime: text("daily_reset_time").notNull(), // 'HH:MM'
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastResetAt: integer("last_reset_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const roomTables = sqliteTable(
  "room_tables",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull(),
    type: text("type", { enum: tableTypeEnum.enumValues }).notNull(),
    /** Community-voted nickname (see `table-names.ts`), null until a proposal crosses the threshold. */
    nickname: text("nickname"),
    x: real("x").notNull(),
    y: real("y").notNull(),
    width: real("width").notNull(),
    height: real("height").notNull(),
    rotation: real("rotation").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("uq_room_tables_room_code").on(table.roomId, table.code)],
);

export const seats = sqliteTable(
  "seats",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => roomTables.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    seatNumber: integer("seat_number").notNull(),
    x: real("x").notNull(),
    y: real("y").notNull(),
    rotation: real("rotation").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_seats_room_code").on(table.roomId, table.code),
    index("idx_seats_room_id").on(table.roomId),
  ],
);

export const seatCurrentState = sqliteTable(
  "seat_current_state",
  {
    seatId: text("seat_id")
      .primaryKey()
      .references(() => seats.id, { onDelete: "cascade" }),
    status: text("status", { enum: seatStatusEnum.enumValues }).notNull().default("UNKNOWN"),
    confidence: real("confidence").notNull().default(0),
    sourceSummary: text("source_summary"),
    lastUpdatedAt: integer("last_updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("idx_seat_current_state_status").on(table.status)],
);
