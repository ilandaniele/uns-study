import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { TableNameProposalDto, TableNamesDto } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";

const UNIQUE_VIOLATION = "23505";
/** A table's nickname is only "locked in" once its top proposal clears this many votes. */
const NICKNAME_VOTE_THRESHOLD = 5;
/** Cap on ACTIVE proposals any one user can have open per room, to keep the list usable. */
const MAX_ACTIVE_PROPOSALS_PER_USER = 3;

/** Small, deliberately conservative blocklist — this filters obviously abusive names, not every
 *  possible slur; anything that slips through can still be removed by an admin. */
const PROFANITY_BLOCKLIST = [
  "puta",
  "puto",
  "putos",
  "putas",
  "mierda",
  "pelotud",
  "boluda",
  "forro",
  "conchud",
  "pendejo",
  "pendeja",
  "cornudo",
  "trolo",
  "trola",
  "negro de mierda",
  "concha",
  "verga",
  "pija",
  "cagon",
  "cagón",
];

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
    await this.restrictions.assertNot(userId, ["SUSPENDED", "BANNED"]);
    const table = await this.getTableOrThrow(tableId);
    if (table.type !== "MAIN_TABLE") throw ApiErrors.validation("Solo se pueden proponer nombres para mesas.");

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
    await this.restrictions.assertNot(userId, ["SUSPENDED", "BANNED"]);

    const [proposal] = await this.db.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1);
    if (!proposal || proposal.status !== "ACTIVE") throw ApiErrors.notFound("Propuesta no encontrada.");

    const now = new Date();
    await this.db
      .insert(schema.tableNameVotes)
      .values({ proposalId, tableId: proposal.tableId, userId, createdAt: now })
      .onConflictDoUpdate({
        target: [schema.tableNameVotes.tableId, schema.tableNameVotes.userId],
        set: { proposalId, createdAt: now },
      });

    await this.recomputeNickname(proposal.tableId);
    return this.listForTable(proposal.tableId, userId);
  }

  async removeVote(proposalId: string, userId: string): Promise<TableNamesDto> {
    const [proposal] = await this.db.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1);
    if (!proposal) throw ApiErrors.notFound("Propuesta no encontrada.");

    await this.db
      .delete(schema.tableNameVotes)
      .where(and(eq(schema.tableNameVotes.proposalId, proposalId), eq(schema.tableNameVotes.userId, userId)));

    await this.recomputeNickname(proposal.tableId);
    return this.listForTable(proposal.tableId, userId);
  }

  // ---- Admin ----

  async adminDeleteProposal(proposalId: string): Promise<void> {
    const [proposal] = await this.db.select().from(schema.tableNameProposals).where(eq(schema.tableNameProposals.id, proposalId)).limit(1);
    if (!proposal) throw ApiErrors.notFound("Propuesta no encontrada.");

    await this.db.update(schema.tableNameProposals).set({ status: "REMOVED" }).where(eq(schema.tableNameProposals.id, proposalId));
    await this.recomputeNickname(proposal.tableId);
  }

  async adminClearNickname(tableId: string): Promise<void> {
    const table = await this.getTableOrThrow(tableId);
    if (table.nickname === null) return;
    await this.db.update(schema.roomTables).set({ nickname: null, updatedAt: new Date() }).where(eq(schema.roomTables.id, tableId));
    this.realtime.emitTableNicknameChanged(table.roomId, { tableId, nickname: null });
  }

  // ---- Internals ----

  private async getTableOrThrow(tableId: string): Promise<typeof schema.roomTables.$inferSelect> {
    const [table] = await this.db.select().from(schema.roomTables).where(eq(schema.roomTables.id, tableId)).limit(1);
    if (!table) throw ApiErrors.notFound("Mesa no encontrada.");
    return table;
  }

  /**
   * Recomputes the table's nickname from its ACTIVE proposals: the proposal with the most votes
   * (minimum `NICKNAME_VOTE_THRESHOLD`) wins; a tie keeps the current nickname if it's one of the
   * tied names, else the earliest-created tied proposal; no qualifying proposal clears it.
   */
  private async recomputeNickname(tableId: string): Promise<void> {
    const table = await this.getTableOrThrow(tableId);

    const rows = await this.db
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

    await this.db.update(schema.roomTables).set({ nickname: nextNickname, updatedAt: new Date() }).where(eq(schema.roomTables.id, tableId));
    this.realtime.emitTableNicknameChanged(table.roomId, { tableId, nickname: nextNickname });
  }
}

/** Throws `VALIDATION_ERROR` for a URL-looking name or one hitting the profanity blocklist. Length
 *  and character-set are already enforced by `proposeTableNameSchema`. */
function assertNameAllowed(name: string): void {
  if (URL_PATTERN.test(name)) {
    throw ApiErrors.validation("El nombre no puede contener enlaces.");
  }
  const normalized = name.toLowerCase();
  if (PROFANITY_BLOCKLIST.some((word) => normalized.includes(word))) {
    throw ApiErrors.validation("Ese nombre no está permitido.");
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code?: string }).code === UNIQUE_VIOLATION) return true;
  const cause = (err as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null && (cause as { code?: string }).code === UNIQUE_VIOLATION;
}
