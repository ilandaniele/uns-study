import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { SocketEvents } from "@sala/contracts/events";
import { FixedClock } from "../platform/clock.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { RecordingHub } from "../realtime/realtime-hub.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { AliasService } from "../users/alias.service.js";
import { BlocksService } from "../blocks/blocks.service.js";
import { buildNotificationService, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { GroupStudyService } from "./group-study.service.js";

const NOW = new Date("2026-10-16T15:00:00.000Z");
const GROUP = "11111111-1111-4111-8111-111111111111";

describe("GroupStudyService", () => {
  let db: Db;
  let hub: RecordingHub;
  let clock: FixedClock;
  let svc: GroupStudyService;
  let seatIds: string[];
  let roomId: string;

  beforeEach(async () => {
    db = freshDb();
    hub = new RecordingHub();
    clock = new FixedClock(NOW);
    const aliases = new AliasService(db);
    const gateway = new RoomRealtimeGateway(hub, new RoomStateService(db), buildNotificationService(db), null);
    svc = new GroupStudyService(db, aliases, new BlocksService(db, aliases), gateway, clock);

    await insertUsers(db, ["u1", "u2", "u3", "outsider"]);
    await db.insert(schema.groupConversations).values({ id: GROUP, name: "Estudio", createdBy: "u1" });
    await db.insert(schema.groupMembers).values([
      { groupId: GROUP, userId: "u1", role: "OWNER" },
      { groupId: GROUP, userId: "u2", role: "MEMBER" },
      { groupId: GROUP, userId: "u3", role: "MEMBER" },
    ]);
    roomId = (await getRoom(db)).id;
    seatIds = (await getSeats(db)).slice(0, 4).map((s) => s.id);
  });

  async function sit(userId: string, seatId: string, startedAt = new Date(NOW.getTime() - 30 * 60_000)) {
    await db.insert(schema.checkIns).values({ userId, roomId, seatId, startedAt, expiresAt: new Date(startedAt.getTime() + 180 * 60_000) });
  }

  const groupEvents = () => hub.sent.filter((e) => e.event === SocketEvents.GroupUpdated);

  describe("presence", () => {
    it("404s for a non-member and for an unknown group", async () => {
      await expect(svc.presence(GROUP, "outsider")).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(svc.presence("22222222-2222-4222-8222-222222222222", "u1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("lists seated members, including the requester, and skips members without an active check-in", async () => {
      await sit("u1", seatIds[0]!);
      await sit("u2", seatIds[1]!);
      const res = await svc.presence(GROUP, "u1");
      expect(res.members.map((m) => m.userId).sort()).toEqual(["u1", "u2"]);
      expect(res.members[0]).toMatchObject({ roomSlug: expect.any(String), seatLabel: expect.any(String), since: expect.any(String) });
      expect(res.sharing).toBe(true);
      expect(res.focus).toBeNull();
    });

    it("ignores ended and expired check-ins", async () => {
      await sit("u2", seatIds[0]!);
      await db.update(schema.checkIns).set({ status: "COMPLETED" });
      await sit("u3", seatIds[1]!, new Date(NOW.getTime() - 200 * 60_000));
      expect((await svc.presence(GROUP, "u1")).members).toEqual([]);
    });

    it("hides a member who opted out, and reports the requester's own opt-out", async () => {
      await sit("u1", seatIds[0]!);
      await sit("u2", seatIds[1]!);
      await svc.setSeatShare(GROUP, "u2", false);
      const forU1 = await svc.presence(GROUP, "u1");
      expect(forU1.members.map((m) => m.userId)).toEqual(["u1"]);
      expect(forU1.sharing).toBe(true);

      const forU2 = await svc.presence(GROUP, "u2");
      expect(forU2.sharing).toBe(false);
      expect(forU2.members.map((m) => m.userId)).not.toContain("u2");
    });

    it("never shows a hidden member's real name", async () => {
      await db.insert(schema.userProfiles).values({ userId: "u2", identityMode: "HIDDEN", firstName: "Secreta" });
      await sit("u2", seatIds[1]!);
      const [member] = (await svc.presence(GROUP, "u1")).members;
      expect(member?.userId).toBe("u2");
      expect(member?.displayName).not.toContain("Secreta");
      expect(member?.displayName).not.toBe("u2");
    });

    it("hides users blocked in either direction with the requester", async () => {
      await sit("u2", seatIds[0]!);
      await sit("u3", seatIds[1]!);
      await db.insert(schema.userBlocks).values([
        { blockerId: "u1", blockedId: "u2" },
        { blockerId: "u3", blockedId: "u1" },
      ]);
      expect((await svc.presence(GROUP, "u1")).members).toEqual([]);
      // A third member who blocked nobody still sees both.
      await db.insert(schema.groupMembers).values({ groupId: GROUP, userId: "outsider", role: "MEMBER" });
      expect((await svc.presence(GROUP, "outsider")).members.map((m) => m.userId).sort()).toEqual(["u2", "u3"]);
    });

    it("returns no focus once the timer has ended and does not delete the row", async () => {
      await svc.startFocus(GROUP, "u1", 25);
      expect((await svc.presence(GROUP, "u2")).focus).toMatchObject({ startedBy: "u1", minutes: 25 });

      clock.set(new Date(NOW.getTime() + 26 * 60_000));
      expect((await svc.presence(GROUP, "u2")).focus).toBeNull();
      expect(await db.select().from(schema.groupFocusTimers)).toHaveLength(1);
    });

    it("degrades when the new tables are missing", async () => {
      await sit("u2", seatIds[0]!);
      await db.run(sql`drop table group_seat_share_optouts`);
      await db.run(sql`drop table group_focus_timers`);
      const res = await svc.presence(GROUP, "u1");
      expect(res).toMatchObject({ sharing: true, focus: null });
      expect(res.members.map((m) => m.userId)).toEqual(["u2"]);
      await expect(svc.setSeatShare(GROUP, "u1", false)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
      await expect(svc.startFocus(GROUP, "u1", 25)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
      await expect(svc.stopFocus(GROUP, "u1")).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    });
  });

  describe("setSeatShare", () => {
    it("404s for a non-member", async () => {
      await expect(svc.setSeatShare(GROUP, "outsider", false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("writes and emits to every member only when the state changes", async () => {
      await svc.setSeatShare(GROUP, "u2", true); // already sharing: no-op
      expect(groupEvents()).toHaveLength(0);
      expect(await db.select().from(schema.groupSeatShareOptouts)).toHaveLength(0);

      await svc.setSeatShare(GROUP, "u2", false);
      expect(await db.select().from(schema.groupSeatShareOptouts)).toHaveLength(1);
      expect(groupEvents().map((e) => e.to).sort()).toEqual(["user:u1", "user:u2", "user:u3"]);

      await svc.setSeatShare(GROUP, "u2", false); // already opted out: no-op
      expect(groupEvents()).toHaveLength(3);

      await svc.setSeatShare(GROUP, "u2", true);
      expect(await db.select().from(schema.groupSeatShareOptouts)).toHaveLength(0);
      expect(groupEvents()).toHaveLength(6);
    });
  });

  describe("focus timer", () => {
    it("404s for a non-member", async () => {
      await expect(svc.startFocus(GROUP, "outsider", 25)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(svc.stopFocus(GROUP, "outsider")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("starts, replaces and stops with one row, emitting to all members", async () => {
      const first = await svc.startFocus(GROUP, "u1", 25);
      expect(first).toEqual({ startedBy: "u1", minutes: 25, startedAt: NOW.toISOString(), endsAt: new Date(NOW.getTime() + 25 * 60_000).toISOString() });
      expect(groupEvents().map((e) => e.to).sort()).toEqual(["user:u1", "user:u2", "user:u3"]);

      const second = await svc.startFocus(GROUP, "u2", 50);
      expect(second.startedBy).toBe("u2");
      expect(await db.select().from(schema.groupFocusTimers)).toHaveLength(1);
      expect(groupEvents()).toHaveLength(6);

      await svc.stopFocus(GROUP, "u3"); // any member may stop
      expect(await db.select().from(schema.groupFocusTimers)).toHaveLength(0);
      expect(groupEvents()).toHaveLength(9);
      expect(groupEvents().every((e) => (e.payload as { groupId: string }).groupId === GROUP)).toBe(true);
    });

    it("stopping when nothing runs neither writes nor emits", async () => {
      await svc.stopFocus(GROUP, "u1");
      expect(groupEvents()).toHaveLength(0);
    });
  });
});
