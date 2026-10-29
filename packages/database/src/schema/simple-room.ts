import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";
import { rooms } from "./rooms.js";

export const userRoomPreferences = sqliteTable("user_room_preferences", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  mode: text("mode", { enum: ["COMMON", "SIMPLE"] }).notNull().default("COMMON"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

/** Static room references only; a visitor's location is never persisted here. */
export const roomSeatCalibrations = sqliteTable("room_seat_calibrations", {
  roomId: text("room_id").primaryKey().references(() => rooms.id, { onDelete: "cascade" }),
  calibration: text("calibration", { mode: "json" }).notNull().$type<{
    anchors: [{ seatId: string; latitude: number; longitude: number }, { seatId: string; latitude: number; longitude: number }, { seatId: string; latitude: number; longitude: number }];
    uncertaintyM: number;
    source: string;
  }>(),
  layoutHash: text("layout_hash").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
