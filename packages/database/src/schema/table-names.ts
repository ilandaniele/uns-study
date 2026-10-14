import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { rooms, roomTables } from "./rooms.js";
import { user } from "./auth.js";

export const tableNameProposalStatusEnum = { enumValues: ["ACTIVE", "REMOVED"] as const };

export const tableNameProposals = sqliteTable(
  "table_name_proposals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => roomTables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // `name` lowercased in JS; carries the case-insensitive uniqueness of ACTIVE proposals.
    nameLower: text("name_lower").notNull(),
    proposerUserId: text("proposer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: tableNameProposalStatusEnum.enumValues }).notNull().default("ACTIVE"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    // Only one ACTIVE proposal per (table, name) — case-insensitive.
    uniqueIndex("uq_table_name_proposals_active")
      .on(table.tableId, table.nameLower)
      .where(sql`status = 'ACTIVE'`),
    index("idx_table_name_proposals_table").on(table.tableId),
    index("idx_table_name_proposals_proposer").on(table.proposerUserId),
  ],
);

export const tableNameVotes = sqliteTable(
  "table_name_votes",
  {
    proposalId: text("proposal_id")
      .notNull()
      .references(() => tableNameProposals.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => roomTables.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.proposalId, table.userId] }),
    // One vote per user per table — voting a different proposal for the same table moves the vote.
    uniqueIndex("uq_table_name_votes_table_user").on(table.tableId, table.userId),
    index("idx_table_name_votes_proposal").on(table.proposalId),
  ],
);
