import { and, eq, gte, sql } from "drizzle-orm";
import { schema, type Db, type Tx } from "@sala/database";
import type { TableNameProposalDto, TableNamesDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import type { RestrictionService } from "../users/restriction.service.js";
import type { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { RoomCache } from "../common/cache/room-cache.service.js";
import { containsProfanity } from "./profanity.js";
import { isUniqueViolation } from "../common/sqlite-errors.js";

/** A table's nickname is only "locked in" once its top proposal clears this many votes. */
const NICKNAME_VOTE_THRESHOLD = 5;
/** Cap on ACTIVE proposals any one user can have open per room, to keep the list usable. */
const MAX_ACTIVE_PROPOSALS_PER_USER = 3;
/** Proposing/voting requires a check-in (any status) in the room within this many days. */
const ELIGIBILITY_WINDOW_DAYS = 30;

const URL_PATTERN = /https?:\/\/|www\.|\.(com|net|org|ar|io|co|info|xyz|gov|edu)\b/i;

type ProposalRow = typeof schema.tableNameProposals.$inferSelect;

/** A nickname that changed inside a transaction; published (cache + realtime) once it commits. */
interface NicknameChange {
  roomId: string;
  tableId: string;
  nickname: string | null;
}

/**
 * Domain logic for community table nicknames: proposing a name for a `MAIN_TABLE`, voting (one
 * vote per user per table, movable), and recomputing which proposal — if any — becomes the
 * table's nickname. The database remains canonical; the realtime event is a notification only.
 */
export class TableNamesService {
  constructor(
    private readonly db: Db,
    private readonly restrictions: RestrictionService,
    private readonly realtime: RoomRealtimeGateway,
    private readonly roomCache: RoomCache = new RoomCache(),
  ) {}

  // ---- Reads ----

  async listForTable(tableId: string, viewerId: string | null): Promise<TableNamesDto> {
    const table = this.getTableOrThrow(tableId);

    const rows = this.db
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
      .orderBy(sql`count(${schema.tableNameVotes.userId}) desc`, schema.tableNameProposals.createdAt)
      .all();

    const myVote = viewerId
      ? (this.db
          .select({ proposalId: schema.tableNameVotes.proposalId })
          .from(schema.tableNameVotes)
          .where(and(eq(schema.tableNameVotes.tableId, tableId), eq(schema.tableNameVotes.userId, viewerId)))
          .limit(1)
          .get()?.proposalId ?? null)
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
    const table = this.getTableOrThrow(tableId);
    if (table.type !== "MAIN_TABLE") throw ApiErrors.validation("Solo se pueden proponer nombres para mesas.");
    this.assertEligible(userId, table.roomId);

    assertNameAllowed(name);

    const nameLower = name.toLowerCase();
    let created: ProposalRow;
    try {
      // Cap check, duplicate check and insert are one sync transaction, so concurrent proposals can't both slip through.
      created = this.db.transaction((tx) => {
        const activeCount = tx
          .select({ value: sql<number>`count(*)` })
          .from(schema.tableNameProposals)
          .where(and(eq(schema.tableNameProposals.roomId, table.roomId), eq(schema.tableNameProposals.proposerUserId, userId), eq(schema.tableNameProposals.status, "ACTIVE")))
          .get();
        if (Number(activeCount?.value ?? 0) >= MAX_ACTIVE_PROPOSALS_PER_USER) {
          throw ApiErrors.validation("Ya tenés el máximo de propuestas activas en esta sala.");
        }

        const duplicate = tx
          .select({ id: schema.tableNameProposals.id })
          .from(schema.tableNameProposals)
          .where(and(eq(schema.tableNameProposals.tableId, tableId), eq(schema.tableNameProposals.nameLower, nameLower), eq(schema.tableNameProposals.status, "ACTIVE")))
          .limit(1)
          .get();
        if (duplicate) throw ApiErrors.validation("Ya hay una propuesta activa con ese nombre para esta mesa.");

        const row = tx
          .insert(schema.tableNameProposals)
          .values({ roomId: table.roomId, tableId, name, nameLower, proposerUserId: userId, status: "ACTIVE" })
          .returning()
          .get();
        if (!row) throw new Error("Failed to insert table name proposal");
        return row;
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err, ["table_name_proposals.name_lower"])) {
        throw ApiErrors.validation("Ya hay una propuesta activa con ese nombre para esta mesa.");
      }
      throw err;
    }

    return { id: created.id, name: created.name, votes: 0, myVote: false, mine: true, createdAt: created.createdAt.toISOString() };
  }

  async vote(proposalId: string, userId: string): Promise<TableNamesDto> {
    await this.restrictions.assertNot(userId, ["MUTE_CHAT", "SUSPENDED", "BANNED"]);

    const proposalForEligibility = this.db.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1).get();
    if (!proposalForEligibility) throw ApiErrors.notFound("Propuesta no encontrada.");
    this.assertEligible(userId, proposalForEligibility.roomId);

    const { tableId, change } = this.db.transaction((tx) => {
      // Re-read inside the transaction: the proposal may have been removed since the eligibility read.
      const proposal = tx.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1).get();
      if (!proposal || proposal.status !== "ACTIVE") throw ApiErrors.notFound("Propuesta no encontrada.");

      const now = new Date();
      tx.insert(schema.tableNameVotes)
        .values({ proposalId, tableId: proposal.tableId, userId, createdAt: now })
        .onConflictDoUpdate({
          target: [schema.tableNameVotes.tableId, schema.tableNameVotes.userId],
          set: { proposalId, createdAt: now },
        })
        .run();

      return { tableId: proposal.tableId, change: this.recomputeNickname(proposal.tableId, tx) };
    });
    this.publishNicknameChange(change);

    return this.listForTable(tableId, userId);
  }

  async removeVote(proposalId: string, userId: string): Promise<TableNamesDto> {
    const { tableId, change } = this.db.transaction((tx) => {
      const proposal = tx.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1).get();
      if (!proposal) throw ApiErrors.notFound("Propuesta no encontrada.");

      tx.delete(schema.tableNameVotes)
        .where(and(eq(schema.tableNameVotes.proposalId, proposalId), eq(schema.tableNameVotes.userId, userId)))
        .run();

      return { tableId: proposal.tableId, change: this.recomputeNickname(proposal.tableId, tx) };
    });
    this.publishNicknameChange(change);

    return this.listForTable(tableId, userId);
  }

  // ---- Admin ----

  async adminDeleteProposal(proposalId: string, actorId: string): Promise<void> {
    const change = this.db.transaction((tx) => {
      const proposal = tx.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1).get();
      if (!proposal) throw ApiErrors.notFound("Propuesta no encontrada.");

      tx.update(schema.tableNameProposals).set({ status: "REMOVED" }).where(eq(schema.tableNameProposals.id, proposalId)).run();
      tx.insert(schema.moderationActions)
        .values({
          actorId,
          targetUserId: proposal.proposerUserId,
          action: "TABLE_NAME_REMOVED",
          metadata: { proposalId: proposal.id, name: proposal.name, tableId: proposal.tableId },
        })
        .run();
      return this.recomputeNickname(proposal.tableId, tx);
    });
    this.publishNicknameChange(change);
  }

  async adminClearNickname(tableId: string, actorId: string): Promise<void> {
    const table = this.getTableOrThrow(tableId);
    if (table.nickname === null) return;
    this.db.transaction((tx) => {
      tx.update(schema.roomTables).set({ nickname: null, updatedAt: new Date() }).where(eq(schema.roomTables.id, tableId)).run();
      tx.insert(schema.moderationActions)
        .values({
          actorId,
          targetUserId: null,
          action: "TABLE_NICKNAME_CLEARED",
          metadata: { tableId, previousNickname: table.nickname },
        })
        .run();
    });
    this.publishNicknameChange({ roomId: table.roomId, tableId, nickname: null });
  }

  // ---- Internals ----

  private getTableOrThrow(tableId: string): typeof schema.roomTables.$inferSelect {
    const table = this.db.select().from(schema.roomTables).where(eq(schema.roomTables.id, tableId)).limit(1).get();
    if (!table) throw ApiErrors.notFound("Mesa no encontrada.");
    return table;
  }

  /** Requires a check-in (any status) by `userId` in `roomId` within the last `ELIGIBILITY_WINDOW_DAYS`
   *  days — proposing/voting on table nicknames is a privilege for people who've actually shown up. */
  private assertEligible(userId: string, roomId: string): void {
    const since = new Date(Date.now() - ELIGIBILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recentCheckIn = this.db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.roomId, roomId), gte(schema.checkIns.createdAt, since)))
      .limit(1)
      .get();
    if (!recentCheckIn) throw ApiErrors.tableNameNotAllowed();
  }

  /**
   * Recomputes the table's nickname from its ACTIVE proposals: the proposal with the most votes
   * (minimum `NICKNAME_VOTE_THRESHOLD`) wins; a tie keeps the current nickname if it's one of the
   * tied names, else the earliest-created tied proposal; no qualifying proposal clears it. A
   * challenger only ever replaces the current nickname by having strictly more votes (a tie always
   * keeps the incumbent). Runs inside the caller's sync transaction and returns the change to
   * publish once it commits, or null when nothing changed.
   */
  private recomputeNickname(tableId: string, tx: Tx): NicknameChange | null {
    const table = tx.select().from(schema.roomTables).where(eq(schema.roomTables.id, tableId)).limit(1).get();
    if (!table) throw ApiErrors.notFound("Mesa no encontrada.");

    const rows = tx
      .select({
        name: schema.tableNameProposals.name,
        createdAt: schema.tableNameProposals.createdAt,
        votes: sql<number>`count(${schema.tableNameVotes.userId})`,
      })
      .from(schema.tableNameProposals)
      .leftJoin(schema.tableNameVotes, eq(schema.tableNameVotes.proposalId, schema.tableNameProposals.id))
      .where(and(eq(schema.tableNameProposals.tableId, tableId), eq(schema.tableNameProposals.status, "ACTIVE")))
      .groupBy(schema.tableNameProposals.id)
      .all();

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

    if (nextNickname === table.nickname) return null;

    tx.update(schema.roomTables).set({ nickname: nextNickname, updatedAt: new Date() }).where(eq(schema.roomTables.id, tableId)).run();
    return { roomId: table.roomId, tableId, nickname: nextNickname };
  }

  private publishNicknameChange(change: NicknameChange | null): void {
    if (!change) return;
    this.roomCache.invalidate(change.roomId); // nicknames are part of the cached room layout
    this.realtime.emitTableNicknameChanged(change.roomId, { tableId: change.tableId, nickname: change.nickname });
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
