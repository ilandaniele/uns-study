import { boolean, date, index, integer, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { rooms } from "./rooms.js";
import { user } from "./auth.js";

export const studySessionSourceEnum = pgEnum("study_session_source", ["CHECK_IN"]);

export const studySessions = pgTable(
  "study_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    checkInId: uuid("check_in_id").unique(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    verifiedMinutes: integer("verified_minutes").notNull(),
    // 'YYYY-MM-DD' in the room's timezone, derived from startedAt.
    localDate: text("local_date").notNull(),
    source: studySessionSourceEnum("source").notNull().default("CHECK_IN"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_study_sessions_user_local_date").on(table.userId, table.localDate),
    index("idx_study_sessions_room_local_date").on(table.roomId, table.localDate),
  ],
);

export const roomQrCodes = pgTable(
  "room_qr_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    tableId: uuid("table_id"),
    token: text("token").notNull().unique(),
    active: boolean("active").notNull().default(true),
    scanCount: integer("scan_count").notNull().default(0),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/** One row per room per local (America/Argentina/Buenos_Aires) day, written by the daily reset job before it clears state. */
export const roomDailyStats = pgTable(
  "room_daily_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    // End-of-day snapshot, taken just before the reset: share (0..1) of seats with live evidence.
    freshSeatCoverage: real("fresh_seat_coverage").notNull().default(0),
    checkIns: integer("check_ins").notNull().default(0),
    observations: integer("observations").notNull().default(0),
    activeUsers: integer("active_users").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uq_room_daily_stats_room_day").on(table.roomId, table.day)],
);
