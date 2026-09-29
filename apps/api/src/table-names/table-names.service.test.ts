import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import type { Auth } from "../auth/auth.instance.js";
import { buildNotificationService, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { TableNamesService } from "./table-names.service.js";

const mockAuth = { api: { getSession: async () => null } } as unknown as Auth;

async function build(db: Db) {
  const roomState = new RoomStateService(db);
  const restrictions = new RestrictionService(db);
  const gateway = new RoomRealtimeGateway(roomState, mockAuth, buildNotificationService(db)); // no @WebSocketServer() attached — emits are no-ops in tests
  return new TableNamesService(db, restrictions, gateway);
}

describe("TableNamesService", () => {
  let db: Db;
  let tableNames: TableNamesService;
  let roomId: string;
  let tableId: string;
  let seatId: string;

  /** Eligibility (M3) requires a check-in (any status) in the room within the last 30 days. */
  async function makeEligible(...userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      await db.insert(schema.checkIns).values({
        userId,
        roomId,
        seatId,
        status: "COMPLETED",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        endedAt: new Date(),
      });
    }
  }

  beforeEach(async () => {
    db = await freshDb();
    tableNames = await build(db);
    const room = await getRoom(db);
    roomId = room.id;
    const [table] = await db
      .select()
      .from(schema.roomTables)
      .where(and(eq(schema.roomTables.roomId, roomId), eq(schema.roomTables.type, "MAIN_TABLE")))
      .limit(1);
    tableId = table!.id;
    seatId = (await getSeats(db))[0]!.id;
    await insertUsers(db, ["u1", "u2", "u3", "u4", "u5", "u6", "admin1"]);
    await makeEligible("u1", "u2", "u3", "u4", "u5", "u6");
  });

  describe("eligibility (M3)", () => {
    it("rejects proposing without a check-in in the room in the last 30 days", async () => {
      await insertUsers(db, ["newcomer"]);
      await expect(tableNames.propose(tableId, "newcomer", "Mesa Nueva")).rejects.toMatchObject({ code: "TABLE_NAME_NOT_ALLOWED" });
    });

    it("rejects voting without a check-in in the room in the last 30 days", async () => {
      const a = await tableNames.propose(tableId, "u1", "Mesa A");
      await insertUsers(db, ["newcomer"]);
      await expect(tableNames.vote(a.id, "newcomer")).rejects.toMatchObject({ code: "TABLE_NAME_NOT_ALLOWED" });
    });

    it("allows proposing/voting for a user with an old (even non-active) check-in in the room", async () => {
      const a = await tableNames.propose(tableId, "u1", "Mesa A");
      await expect(tableNames.vote(a.id, "u2")).resolves.toBeDefined();
    });
  });

  describe("moderation gates (M7)", () => {
    it("rejects proposing while MUTE_CHAT is active", async () => {
      await db.insert(schema.userRestrictions).values({ userId: "u1", type: "MUTE_CHAT", reason: "test" });
      await expect(tableNames.propose(tableId, "u1", "Mesa Muteada")).rejects.toMatchObject({ code: "RESTRICTED" });
    });

    it("rejects voting while MUTE_CHAT is active", async () => {
      const a = await tableNames.propose(tableId, "u1", "Mesa A");
      await db.insert(schema.userRestrictions).values({ userId: "u2", type: "MUTE_CHAT", reason: "test" });
      await expect(tableNames.vote(a.id, "u2")).rejects.toMatchObject({ code: "RESTRICTED" });
    });
  });

  describe("propose", () => {
    it("rejects a blocklisted word", async () => {
      await expect(tableNames.propose(tableId, "u1", "La mesa puta")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects a name containing a URL", async () => {
      await expect(tableNames.propose(tableId, "u1", "visit www.spam.com")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects a duplicate ACTIVE proposal for the same table (case-insensitive)", async () => {
      await tableNames.propose(tableId, "u1", "La Pecera");
      await expect(tableNames.propose(tableId, "u2", "la pecera")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("caps a user at 3 active proposals per room", async () => {
      await tableNames.propose(tableId, "u1", "Nombre Uno");
      await tableNames.propose(tableId, "u1", "Nombre Dos");
      await tableNames.propose(tableId, "u1", "Nombre Tres");
      await expect(tableNames.propose(tableId, "u1", "Nombre Cuatro")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });
  });

  describe("voting", () => {
    it("moving a vote to another proposal removes it from the first", async () => {
      const a = await tableNames.propose(tableId, "u1", "Mesa A");
      const b = await tableNames.propose(tableId, "u1", "Mesa B");

      await tableNames.vote(a.id, "u2");
      let dto = await tableNames.listForTable(tableId, "u2");
      expect(dto.proposals.find((p) => p.id === a.id)?.votes).toBe(1);

      await tableNames.vote(b.id, "u2");
      dto = await tableNames.listForTable(tableId, "u2");
      expect(dto.proposals.find((p) => p.id === a.id)?.votes).toBe(0);
      expect(dto.proposals.find((p) => p.id === b.id)?.votes).toBe(1);
    });

    it("removing a vote decrements the count", async () => {
      const a = await tableNames.propose(tableId, "u1", "Mesa A");
      await tableNames.vote(a.id, "u2");
      await tableNames.removeVote(a.id, "u2");
      const dto = await tableNames.listForTable(tableId, "u2");
      expect(dto.proposals.find((p) => p.id === a.id)?.votes).toBe(0);
    });
  });

  describe("nickname threshold + ties", () => {
    it("sets the nickname once a proposal reaches 5 votes", async () => {
      const a = await tableNames.propose(tableId, "u1", "La Pecera");
      for (const voter of ["u1", "u2", "u3", "u4", "u5"]) {
        await tableNames.vote(a.id, voter);
      }
      const [table] = await db.select().from(schema.roomTables).where(eq(schema.roomTables.id, tableId));
      expect(table?.nickname).toBe("La Pecera");
    });

    it("does not set a nickname below the 5-vote threshold", async () => {
      const a = await tableNames.propose(tableId, "u1", "La Pecera");
      for (const voter of ["u1", "u2", "u3", "u4"]) {
        await tableNames.vote(a.id, voter);
      }
      const [table] = await db.select().from(schema.roomTables).where(eq(schema.roomTables.id, tableId));
      expect(table?.nickname).toBeNull();
    });

    it("keeps the current nickname on a tie", async () => {
      const a = await tableNames.propose(tableId, "u1", "Nombre A");
      const b = await tableNames.propose(tableId, "u1", "Nombre B");

      // u1..u5 vote A across two separate users pools to get A to 5 first, then tie B up to 5.
      for (const voter of ["u1", "u2", "u3", "u4", "u5"]) await tableNames.vote(a.id, voter);
      let [table] = await db.select().from(schema.roomTables).where(eq(schema.roomTables.id, tableId));
      expect(table?.nickname).toBe("Nombre A");

      await insertUsers(db, ["u7", "u8", "u9", "u10", "u11"]);
      await makeEligible("u7", "u8", "u9", "u10", "u11");
      for (const voter of ["u7", "u8", "u9", "u10", "u11"]) await tableNames.vote(b.id, voter);
      [table] = await db.select().from(schema.roomTables).where(eq(schema.roomTables.id, tableId));
      // Both proposals now sit at 5 votes — the tie keeps the incumbent nickname.
      expect(table?.nickname).toBe("Nombre A");
    });
  });

  describe("admin", () => {
    it("deleting the winning proposal clears the nickname on recompute", async () => {
      const a = await tableNames.propose(tableId, "u1", "La Pecera");
      for (const voter of ["u1", "u2", "u3", "u4", "u5"]) await tableNames.vote(a.id, voter);
      let [table] = await db.select().from(schema.roomTables).where(eq(schema.roomTables.id, tableId));
      expect(table?.nickname).toBe("La Pecera");

      await tableNames.adminDeleteProposal(a.id, "admin1");
      [table] = await db.select().from(schema.roomTables).where(eq(schema.roomTables.id, tableId));
      expect(table?.nickname).toBeNull();
    });

    it("adminClearNickname clears a set nickname", async () => {
      const a = await tableNames.propose(tableId, "u1", "La Pecera");
      for (const voter of ["u1", "u2", "u3", "u4", "u5"]) await tableNames.vote(a.id, voter);

      await tableNames.adminClearNickname(tableId, "admin1");
      const [table] = await db.select().from(schema.roomTables).where(eq(schema.roomTables.id, tableId));
      expect(table?.nickname).toBeNull();
    });

    it("writes a moderation_actions row when an admin deletes a proposal (M6)", async () => {
      const a = await tableNames.propose(tableId, "u1", "La Pecera");
      await tableNames.adminDeleteProposal(a.id, "admin1");

      const [action] = await db.select().from(schema.moderationActions).where(eq(schema.moderationActions.action, "TABLE_NAME_REMOVED"));
      expect(action?.actorId).toBe("admin1");
      expect(action?.targetUserId).toBe("u1");
    });

    it("writes a moderation_actions row when an admin clears a nickname (M6)", async () => {
      const a = await tableNames.propose(tableId, "u1", "La Pecera");
      for (const voter of ["u1", "u2", "u3", "u4", "u5"]) await tableNames.vote(a.id, voter);

      await tableNames.adminClearNickname(tableId, "admin1");
      const [action] = await db.select().from(schema.moderationActions).where(eq(schema.moderationActions.action, "TABLE_NICKNAME_CLEARED"));
      expect(action?.actorId).toBe("admin1");
    });
  });
});
