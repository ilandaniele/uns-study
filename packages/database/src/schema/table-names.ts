import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { rooms, roomTables } from "./rooms.js";
import { user } from "./auth.js";

export const tableNameProposalStatusEnum = pgEnum("table_name_proposal_status", ["ACTIVE", "REMOVED"]);

export const tableNameProposals = pgTable(
  "table_name_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    tableId: uuid("table_id")
      .notNull()
      .references(() => roomTables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    proposerUserId: text("proposer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: tableNameProposalStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Only one ACTIVE proposal per (table, name) — case-insensitive.
    uniqueIndex("uq_table_name_proposals_active")
      .on(table.tableId, sql`lower(${table.name})`)
      .where(sql`status = 'ACTIVE'`),
    index("idx_table_name_proposals_table").on(table.tableId),
    index("idx_table_name_proposals_proposer").on(table.proposerUserId),
  ],
);

export const tableNameVotes = pgTable(
  "table_name_votes",
  {
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => tableNameProposals.id, { onDelete: "cascade" }),
    tableId: uuid("table_id")
      .notNull()
      .references(() => roomTables.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.proposalId, table.userId] }),
    // One vote per user per table — voting a different proposal for the same table moves the vote.
    uniqueIndex("uq_table_name_votes_table_user").on(table.tableId, table.userId),
    index("idx_table_name_votes_proposal").on(table.proposalId),
  ],
);
