import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);
