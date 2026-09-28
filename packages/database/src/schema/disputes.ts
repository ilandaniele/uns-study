import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { checkIns } from "./checkins.js";
import { rooms, seats } from "./rooms.js";
import { user } from "./auth.js";

export const disputeKindEnum = pgEnum("dispute_kind", ["CLAIM", "ABSENT", "SAVED"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["OPEN", "RESOLVED_ABSENT", "RESOLVED_PRESENT", "TIED", "CANCELLED"]);
export const disputeVoteEnum = pgEnum("dispute_vote", ["ABSENT", "PRESENT"]);

export const seatDisputes = pgTable(
  "seat_disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "cascade" }),
    // Null for a SAVED dispute opened on a seat with no active check-in (belongings only, no incumbent).
    checkInId: uuid("check_in_id").references(() => checkIns.id, { onDelete: "set null" }),
    incumbentUserId: text("incumbent_user_id").references(() => user.id, { onDelete: "set null" }),
    openerUserId: text("opener_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: disputeKindEnum("kind").notNull(),
    status: disputeStatusEnum("status").notNull().default("OPEN"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    // Minimal claimant location evidence, like check-ins: accuracy only, no raw coordinates persisted.
    locationAccuracyM: real("location_accuracy_m"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Only one OPEN dispute per seat at a time.
    uniqueIndex("uq_dispute_open_seat")
      .on(table.seatId)
      .where(sql`status = 'OPEN'`),
    index("idx_seat_disputes_closes_at")
      .on(table.closesAt)
      .where(sql`status = 'OPEN'`),
    index("idx_seat_disputes_room").on(table.roomId),
    index("idx_seat_disputes_check_in").on(table.checkInId),
  ],
);

export const seatDisputeVotes = pgTable(
  "seat_dispute_votes",
  {
    disputeId: uuid("dispute_id")
      .notNull()
      .references(() => seatDisputes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vote: disputeVoteEnum("vote").notNull(),
    weight: integer("weight").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.disputeId, table.userId] })],
);
