import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";
import { groupConversations } from "./groups.js";
import { rooms } from "./rooms.js";

// Pro features. Every table here is new on purpose: no column was added to an existing table, so an
// unapplied migration only ever breaks code that touches these tables (and that code tolerates it).

/** One watch per user: "tell me when one of these seats frees up". `seat_ids` is a JSON string[] (1..12). */
export const seatWatches = sqliteTable(
  "seat_watches",
  {
    userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
    roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    seatIds: text("seat_ids").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_seat_watches_room_expires").on(t.roomId, t.expiresAt)],
);

/** Latest occupancy forecast per room; `data` is a JSON ForecastData. */
export const roomOccupancyForecast = sqliteTable("room_occupancy_forecast", {
  roomId: text("room_id").primaryKey().references(() => rooms.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  computedAt: integer("computed_at", { mode: "timestamp_ms" }).notNull(),
});

/** A user's favorite seats in a room; `seat_ids` is a JSON string[] (1..3). */
export const favoriteSeats = sqliteTable(
  "favorite_seats",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    seatIds: text("seat_ids").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roomId] })],
);

/** A row means the member opted out of sharing their seat with the group; no row means sharing. */
export const groupSeatShareOptouts = sqliteTable(
  "group_seat_share_optouts",
  {
    groupId: text("group_id").notNull().references(() => groupConversations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

/** The running shared focus timer of a group; stopping it deletes the row. */
export const groupFocusTimers = sqliteTable("group_focus_timers", {
  groupId: text("group_id").primaryKey().references(() => groupConversations.id, { onDelete: "cascade" }),
  startedBy: text("started_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  minutes: integer("minutes").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
});

/** Weekly study goal plus whether the user wants the reminder push (on by default). */
export const studyGoals = sqliteTable("study_goals", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  weeklyGoalMinutes: integer("weekly_goal_minutes").notNull(),
  reminderEnabled: integer("reminder_enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

/** A day the user froze so it still counts toward their streak. `local_date` is YYYY-MM-DD, ART. */
export const streakFreezes = sqliteTable(
  "streak_freezes",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate] })],
);

/** An upcoming exam the user is preparing for. `exam_date` is YYYY-MM-DD, ART. */
export const userExams = sqliteTable(
  "user_exams",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    examDate: text("exam_date").notNull(),
    targetHours: integer("target_hours").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_user_exams_user").on(t.userId)],
);
