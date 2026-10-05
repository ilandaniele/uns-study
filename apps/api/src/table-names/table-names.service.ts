import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { TableNameProposalDto, TableNamesDto } from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { RoomCache } from "../common/cache/room-cache.service.js";
import { containsProfanity } from "./profanity.js";
import { isUniqueViolation } from "../common/pg-errors.js";

/** A table's nickname is only "locked in" once its top proposal clears this many votes. */
const NICKNAME_VOTE_THRESHOLD = 5;
/** Cap on ACTIVE proposals any one user can have open per room, to keep the list usable. */
const MAX_ACTIVE_PROPOSALS_PER_USER = 3;
/** Proposing/voting requires a check-in (any status) in the room within this many days. */
const ELIGIBILITY_WINDOW_DAYS = 30;

const URL_PATTERN = /https?:\/\/|www\.|\.(com|net|org|ar|io|co|info|xyz|gov|edu)\b/i;

type ProposalRow = typeof schema.tableNameProposals.$inferSelect;

/**
 * Domain logic for community table nicknames: proposing a name for a `MAIN_TABLE`, voting (one
 * vote per user per table, movable), and recomputing which proposal — if any — becomes the
 * table's nickname. PostgreSQL remains canonical; the realtime event is a notification only.
 */
@Injectable()
export class TableNamesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
    @Inject(RoomCache) private readonly roomCache: RoomCache = new RoomCache(),
  ) {}

  // ---- Reads ----

  async listForTable(tableId: string, viewerId: string | null): Promise<TableNamesDto> {
    const table = await this.getTableOrThrow(tableId);

    const rows = await this.db
      .select({
        id: schema.tableNameProposals.id,
        name: schema.tableNameProposals.name,
        proposerUserId: schema.tableNameProposals.proposerUserId,
        createdAt: schema.tableNameProposals.createdAt,
        votes: sql<number>`count(${schema.tableNameVotes.userId})`,
      })
      .from(schema.tableNameProposals)
      .leftJoin(schema.tableNameVotes, eq(schema.tableNameVotes.proposalId, schema.tableNameProposals.id))
      .where(and(eq(schema.tableNameProposals.tableId, tableId), eq(schema.tableNameProposals.status, "ACTIVE")))
      .groupBy(schema.tableNameProposals.id)
      .orderBy(sql`count(${schema.tableNameVotes.userId}) desc`, schema.tableNameProposals.createdAt);

    const myVote = viewerId
      ? await this.db
          .select({ proposalId: schema.tableNameVotes.proposalId })
          .from(schema.tableNameVotes)
          .where(and(eq(schema.tableNameVotes.tableId, tableId), eq(schema.tableNameVotes.userId, viewerId)))
          .limit(1)
          .then((r) => r[0]?.proposalId ?? null)
      : null;

    const proposals: TableNameProposalDto[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      votes: Number(row.votes),
      myVote: myVote === row.id,
      mine: viewerId != null && row.proposerUserId === viewerId,
      createdAt: new Date(row.createdAt).toISOString(),
    }));

    return { tableId, nickname: table.nickname, proposals };
  }

  // ---- Writes ----

  async propose(tableId: string, userId: string, name: string): Promise<TableNameProposalDto> {
    await this.restrictions.assertNot(userId, ["MUTE_CHAT", "SUSPENDED", "BANNED"]);
    const table = await this.getTableOrThrow(tableId);
    if (table.type !== "MAIN_TABLE") throw ApiErrors.validation("Solo se pueden proponer nombres para mesas.");
    await this.assertEligible(userId, table.roomId);

    assertNameAllowed(name);

    const [activeCount] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(schema.tableNameProposals)
      .where(and(eq(schema.tableNameProposals.roomId, table.roomId), eq(schema.tableNameProposals.proposerUserId, userId), eq(schema.tableNameProposals.status, "ACTIVE")));
    if (Number(activeCount?.value ?? 0) >= MAX_ACTIVE_PROPOSALS_PER_USER) {
      throw ApiErrors.validation("Ya tenés el máximo de propuestas activas en esta sala.");
    }

    let created: ProposalRow;
    try {
      const [row] = await this.db
        .insert(schema.tableNameProposals)
        .values({ roomId: table.roomId, tableId, name, proposerUserId: userId, status: "ACTIVE" })
        .returning();
      if (!row) throw new Error("Failed to insert table name proposal");
      created = row;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) throw ApiErrors.validation("Ya hay una propuesta activa con ese nombre para esta mesa.");
      throw err;
    }

    return { id: created.id, name: created.name, votes: 0, myVote: false, mine: true, createdAt: created.createdAt.toISOString() };
  }

  async vote(proposalId: string, userId: string): Promise<TableNamesDto> {
    await this.restrictions.assertNot(userId, ["MUTE_CHAT", "SUSPENDED", "BANNED"]);

    const [proposalForEligibility] = await this.db.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1);
    if (!proposalForEligibility) throw ApiErrors.notFound("Propuesta no encontrada.");
    await this.assertEligible(userId, proposalForEligibility.roomId);

    const tableId = await this.db.transaction(async (tx) => {
      // Serializes with any concurrent vote/unvote/admin-removal on this table so the recompute
      // below always sees a consistent vote count.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${proposalForEligibility.tableId}))`);

      // Re-read inside the lock: another transaction may have removed this proposal just before we acquired it.
      const [proposal] = await tx.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1);
      if (!proposal || proposal.status !== "ACTIVE") throw ApiErrors.notFound("Propuesta no encontrada.");

      const now = new Date();
      await tx
        .insert(schema.tableNameVotes)
        .values({ proposalId, tableId: proposal.tableId, userId, createdAt: now })
        .onConflictDoUpdate({
          target: [schema.tableNameVotes.tableId, schema.tableNameVotes.userId],
          set: { proposalId, createdAt: now },
        });

      await this.recomputeNickname(proposal.tableId, tx);
      return proposal.tableId;
    });

    return this.listForTable(tableId, userId);
  }

  async removeVote(proposalId: string, userId: string): Promise<TableNamesDto> {
    const [proposalForLock] = await this.db.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1);
    if (!proposalForLock) throw ApiErrors.notFound("Propuesta no encontrada.");

    const tableId = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${proposalForLock.tableId}))`);

      const [proposal] = await tx.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1);
      if (!proposal) throw ApiErrors.notFound("Propuesta no encontrada.");

      await tx
        .delete(schema.tableNameVotes)
        .where(and(eq(schema.tableNameVotes.proposalId, proposalId), eq(schema.tableNameVotes.userId, userId)));

      await this.recomputeNickname(proposal.tableId, tx);
      return proposal.tableId;
    });

    return this.listForTable(tableId, userId);
  }

  // ---- Admin ----

  async adminDeleteProposal(proposalId: string, actorId: string): Promise<void> {
    const [proposalForLock] = await this.db.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1);
    if (!proposalForLock) throw ApiErrors.notFound("Propuesta no encontrada.");

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${proposalForLock.tableId}))`);

      const [proposal] = await tx.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1);
      if (!proposal) throw ApiErrors.notFound("Propuesta no encontrada.");

      await tx.update(schema.tableNameProposals).set({ status: "REMOVED" }).where(eq(schema.tableNameProposals.id, proposalId));
      await tx.insert(schema.moderationActions).values({
        actorId,
        targetUserId: proposal.proposerUserId,
        action: "TABLE_NAME_REMOVED",
        metadata: { proposalId: proposal.id, name: proposal.name, tableId: proposal.tableId },
      });
      await this.recomputeNickname(proposal.tableId, tx);
    });
  }

  async adminClearNickname(tableId: string, actorId: string): Promise<void> {
    const table = await this.getTableOrThrow(tableId);
    if (table.nickname === null) return;
    await this.db.transaction(async (tx) => {
      await tx.update(schema.roomTables).set({ nickname: null, updatedAt: new Date() }).where(eq(schema.roomTables.id, tableId));
      await tx.insert(schema.moderationActions).values({
        actorId,
        targetUserId: null,
        action: "TABLE_NICKNAME_CLEARED",
        metadata: { tableId, previousNickname: table.nickname },
      });
    });
    this.roomCache.invalidate(table.roomId); // nicknames are part of the cached room layout
    this.realtime.emitTableNicknameChanged(table.roomId, { tableId, nickname: null });
  }

  // ---- Internals ----

  private async getTableOrThrow(tableId: string): Promise<typeof schema.roomTables.$inferSelect> {
    const [table] = await this.db.select().from(schema.roomTables).where(eq(schema.roomTables.id, tableId)).limit(1);
    if (!table) throw ApiErrors.notFound("Mesa no encontrada.");
    return table;
  }

  /** Requires a check-in (any status) by `userId` in `roomId` within the last `ELIGIBILITY_WINDOW_DAYS`
   *  days — proposing/voting on table nicknames is a privilege for people who've actually shown up. */
  private async assertEligible(userId: string, roomId: string): Promise<void> {
    const since = new Date(Date.now() - ELIGIBILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [recentCheckIn] = await this.db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.roomId, roomId), gte(schema.checkIns.createdAt, since)))
      .limit(1);
    if (!recentCheckIn) throw ApiErrors.tableNameNotAllowed();
  }

  /**
   * Recomputes the table's nickname from its ACTIVE proposals: the proposal with the most votes
   * (minimum `NICKNAME_VOTE_THRESHOLD`) wins; a tie keeps the current nickname if it's one of the
   * tied names, else the earliest-created tied proposal; no qualifying proposal clears it. A
   * challenger only ever replaces the current nickname by having strictly more votes (a tie always
   * keeps the incumbent) — callers must hold the per-table advisory lock before calling this.
   */
  private async recomputeNickname(tableId: string, tx: Db = this.db): Promise<void> {
    const [table] = await tx.select().from(schema.roomTables).where(eq(schema.roomTables.id, tableId)).limit(1);
    if (!table) throw ApiErrors.notFound("Mesa no encontrada.");

    const rows = await tx
      .select({
        name: schema.tableNameProposals.name,
        createdAt: schema.tableNameProposals.createdAt,
        votes: sql<number>`count(${schema.tableNameVotes.userId})`,
      })
      .from(schema.tableNameProposals)
      .leftJoin(schema.tableNameVotes, eq(schema.tableNameVotes.proposalId, schema.tableNameProposals.id))
      .where(and(eq(schema.tableNameProposals.tableId, tableId), eq(schema.tableNameProposals.status, "ACTIVE")))
      .groupBy(schema.tableNameProposals.id);

    const candidates = rows.filter((r) => Number(r.votes) >= NICKNAME_VOTE_THRESHOLD);

    let nextNickname: string | null = null;
    if (candidates.length > 0) {
      const maxVotes = Math.max(...candidates.map((c) => Number(c.votes)));
      const top = candidates.filter((c) => Number(c.votes) === maxVotes);
      if (top.length === 1) {
        nextNickname = top[0]!.name;
      } else if (table.nickname != null && top.some((t) => t.name === table.nickname)) {
        nextNickname = table.nickname;
      } else {
        nextNickname = [...top].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]!.name;
      }
    }

    if (nextNickname === table.nickname) return;

    await tx.update(schema.roomTables).set({ nickname: nextNickname, updatedAt: new Date() }).where(eq(schema.roomTables.id, tableId));
    this.roomCache.invalidate(table.roomId); // nicknames are part of the cached room layout
    this.realtime.emitTableNicknameChanged(table.roomId, { tableId, nickname: nextNickname });
  }
}

/** Throws `VALIDATION_ERROR` for a URL-looking name or one hitting the profanity blocklist. Length
 *  and character-set are already enforced by `proposeTableNameSchema`. */
function assertNameAllowed(name: string): void {
  if (URL_PATTERN.test(name)) {
    throw ApiErrors.validation("El nombre no puede contener enlaces.");
  }
  if (containsProfanity(name)) {
    throw ApiErrors.validation("Ese nombre no está permitido.");
  }
}
