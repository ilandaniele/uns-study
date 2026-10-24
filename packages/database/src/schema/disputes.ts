import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { checkIns } from "./checkins.js";
import { rooms, seats } from "./rooms.js";
import { user } from "./auth.js";

export const disputeKindEnum = { enumValues: ["CLAIM", "ABSENT", "SAVED"] as const };
export const disputeStatusEnum = { enumValues: ["OPEN", "RESOLVED_ABSENT", "RESOLVED_PRESENT", "TIED", "CANCELLED"] as const };
export const disputeVoteEnum = { enumValues: ["ABSENT", "PRESENT", "SAVED"] as const };

export const seatDisputes = sqliteTable(
  "seat_disputes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    seatId: text("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "cascade" }),
    // Null for a SAVED dispute opened on a seat with no active check-in (belongings only, no incumbent).
    checkInId: text("check_in_id").references(() => checkIns.id, { onDelete: "set null" }),
    incumbentUserId: text("incumbent_user_id").references(() => user.id, { onDelete: "set null" }),
    openerUserId: text("opener_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: disputeKindEnum.enumValues }).notNull(),
    status: text("status", { enum: disputeStatusEnum.enumValues }).notNull().default("OPEN"),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    closesAt: integer("closes_at", { mode: "timestamp_ms" }).notNull(),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    // Minimal claimant location evidence, like check-ins: accuracy only, no raw coordinates persisted.
    locationAccuracyM: real("location_accuracy_m"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    // Only one OPEN dispute per seat at a time.
    uniqueIndex("uq_dispute_open_seat")
      .on(table.seatId)
      .where(sql`status = 'OPEN'`),
    index("idx_seat_disputes_closes_at")
      .on(table.closesAt)
      .where(sql`status = 'OPEN'`),
    index("idx_seat_disputes_room_status").on(table.roomId, table.status),
    index("idx_seat_disputes_check_in").on(table.checkInId),
    index("idx_seat_disputes_seat_resolved").on(table.seatId, table.resolvedAt),
  ],
);

export const seatDisputeVotes = sqliteTable(
  "seat_dispute_votes",
  {
    disputeId: text("dispute_id")
      .notNull()
      .references(() => seatDisputes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vote: text("vote", { enum: disputeVoteEnum.enumValues }).notNull(),
    weight: integer("weight").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.disputeId, table.userId] })],
);
