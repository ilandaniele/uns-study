import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { checkIns } from "./checkins.js";

// Derived attendance only. Never store a person's coordinates or route.
export const checkInMonitors = sqliteTable("check_in_monitors", {
  checkInId: text("check_in_id").primaryKey().references(() => checkIns.id, { onDelete: "cascade" }),
  countingFrom: integer("counting_from", { mode: "timestamp_ms" }),
  verifiedUntil: integer("verified_until", { mode: "timestamp_ms" }).notNull(),
  lastSampleAt: integer("last_sample_at", { mode: "timestamp_ms" }).notNull(),
  outsideSince: integer("outside_since", { mode: "timestamp_ms" }),
  deviceId: text("device_id"),
}, table => [index("idx_check_in_monitors_outside").on(table.outsideSince)]);

export const checkInStudySpans = sqliteTable("check_in_study_spans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  checkInId: text("check_in_id").notNull().references(() => checkIns.id, { onDelete: "cascade" }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }).notNull(),
}, table => [index("idx_check_in_study_spans_checkin").on(table.checkInId)]);
