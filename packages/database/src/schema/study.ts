import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { rooms, seats } from "./rooms.js";
import { user } from "./auth.js";

export const studySessionSourceEnum = { enumValues: ["CHECK_IN", "MANUAL"] as const };

export const studySessions = sqliteTable(
  "study_sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    checkInId: text("check_in_id").unique(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }).notNull(),
    verifiedMinutes: integer("verified_minutes").notNull(),
    // 'YYYY-MM-DD' in the room's timezone, derived from startedAt.
    localDate: text("local_date").notNull(),
    source: text("source", { enum: studySessionSourceEnum.enumValues }).notNull().default("CHECK_IN"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_study_sessions_user_local_date").on(table.userId, table.localDate),
    index("idx_study_sessions_room_local_date").on(table.roomId, table.localDate),
  ],
);

export const roomQrCodes = sqliteTable(
  "room_qr_codes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    tableId: text("table_id"),
    seatId: text("seat_id").references(() => seats.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    scanCount: integer("scan_count").notNull().default(0),
    lastScannedAt: integer("last_scanned_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
);

/** One row per room per local (America/Argentina/Buenos_Aires) day, written by the daily reset job before it clears state. */
export const roomDailyStats = sqliteTable(
  "room_daily_stats",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    // End-of-day snapshot, taken just before the reset: share (0..1) of seats with live evidence.
    freshSeatCoverage: real("fresh_seat_coverage").notNull().default(0),
    checkIns: integer("check_ins").notNull().default(0),
    observations: integer("observations").notNull().default(0),
    activeUsers: integer("active_users").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("uq_room_daily_stats_room_day").on(table.roomId, table.day)],
);

/**
 * Distinct room visitors per local day, for the "N personas consultaron la sala hoy" line. One row
 * per `(room, local day, visitor_hash)`; `visitor_hash` is a salted sha256 of the user id or IP —
 * never the raw value. Rows older than a week are purged by the daily reset job.
 */
export const roomDailyVisitors = sqliteTable(
  "room_daily_visitors",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.roomId, table.localDate, table.visitorHash] })],
);
