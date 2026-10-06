import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { countQueries, freshDb, insertUsers } from "../test-utils.js";
import { RestrictionService } from "../users/restriction.service.js";
import { AliasService } from "../users/alias.service.js";
import { BlocksService } from "../blocks/blocks.service.js";
import { GroupsService } from "./groups.service.js";

function build(db: Db) {
  const restrictions = new RestrictionService(db);
  const aliases = new AliasService(db);
  const blocks = new BlocksService(db, aliases);
  return new GroupsService(db, restrictions, blocks, aliases);
}

/** Seeds a `direct_conversations` row (ordered pair) so `a` and `b` are contacts. */
async function makeContacts(db: Db, a: string, b: string) {
  const [userA, userB] = a < b ? [a, b] : [b, a];
  await db.insert(schema.directConversations).values({ userA, userB });
}

const RANDOM_UUID = "11111111-1111-4111-8111-111111111111";

describe("GroupsService", () => {
  let db: Db;
  let svc: GroupsService;

  beforeEach(async () => {
    db = await freshDb();
    svc = build(db);
    await insertUsers(db, ["u1", "u2", "u3", "u4"]);
    await makeContacts(db, "u1", "u2");
    await makeContacts(db, "u1", "u3");
  });

  async function newGroup(memberIds = ["u2", "u3"]) {
    const { group } = await svc.createGroup("u1", { name: "  Estudio  ", memberIds });
    return group;
  }

  describe("createGroup", () => {
    it("creates the group with the owner as OWNER and the rest as MEMBER", async () => {
      const { group, memberIds } = await svc.createGroup("u1", { name: "  Estudio  ", memberIds: ["u2", "u3"] });

      expect(group.name).toBe("Estudio");
      expect(group.myRole).toBe("OWNER");
      expect(group.members.map((m) => [m.userId, m.role])).toEqual(
        expect.arrayContaining([
          ["u1", "OWNER"],
          ["u2", "MEMBER"],
          ["u3", "MEMBER"],
        ]),
      );
      expect(group.members[0]!.role).toBe("OWNER");
      expect(group.members).toHaveLength(3);
      expect(group.lastMessage).toBeNull();
      expect(group.unread).toBe(0);
      expect(memberIds.sort()).toEqual(["u1", "u2", "u3"]);
    });

    it("rejects a non-contact target and writes nothing", async () => {
      await expect(svc.createGroup("u1", { name: "g", memberIds: ["u2", "u4"] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(await db.select().from(schema.groupConversations)).toHaveLength(0);
      expect(await db.select().from(schema.groupMembers)).toHaveLength(0);
    });

    it("rejects blocked targets in either direction", async () => {
      await db.insert(schema.userBlocks).values({ blockerId: "u1", blockedId: "u2" });
      await expect(svc.createGroup("u1", { name: "g", memberIds: ["u2"] })).rejects.toMatchObject({ code: "BLOCKED" });

      await db.insert(schema.userBlocks).values({ blockerId: "u3", blockedId: "u1" });
      await expect(svc.createGroup("u1", { name: "g", memberIds: ["u3"] })).rejects.toMatchObject({ code: "BLOCKED" });
    });

    it("rejects targets that blocked each other, even when neither blocked the owner", async () => {
      await db.insert(schema.userBlocks).values({ blockerId: "u2", blockedId: "u3" });
      await expect(svc.createGroup("u1", { name: "g", memberIds: ["u2", "u3"] })).rejects.toMatchObject({ code: "BLOCKED" });
      expect(await db.select().from(schema.groupConversations)).toHaveLength(0);
    });

    it("rejects targets that disabled direct messages", async () => {
      await db.insert(schema.userPrivacySettings).values({ userId: "u2", allowDirectMessages: false });
      await expect(svc.createGroup("u1", { name: "g", memberIds: ["u2"] })).rejects.toMatchObject({ code: "DM_NOT_ALLOWED" });
    });

    it("rejects unknown users, self, and restricted requesters", async () => {
      await expect(svc.createGroup("u1", { name: "g", memberIds: ["ghost"] })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(svc.createGroup("u1", { name: "g", memberIds: ["u1"] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

      await db.insert(schema.userRestrictions).values({ userId: "u1", type: "SUSPENDED", reason: "t" });
      await expect(svc.createGroup("u1", { name: "g", memberIds: ["u2"] })).rejects.toMatchObject({ code: "RESTRICTED" });
    });
  });

  describe("member cap and add", () => {
    async function seedMany(count: number): Promise<string[]> {
      const ids = Array.from({ length: count }, (_, i) => `m${String(i).padStart(2, "0")}`);
      await insertUsers(db, ids);
      for (const id of ids) await makeContacts(db, "u1", id);
      return ids;
    }

    it("allows 19 members at creation and rejects a 21st", async () => {
      const ids = await seedMany(20);
      const { group } = await svc.createGroup("u1", { name: "g", memberIds: ids.slice(0, 19) });
      expect(group.members).toHaveLength(20);

      await expect(svc.addMembers(group.id, "u1", [ids[19]!])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, group.id))).toHaveLength(20);
    });

    it("adds new members and ignores ones already in the group", async () => {
      const group = await newGroup(["u2"]);

      const noop = await svc.addMembers(group.id, "u1", ["u2"]);
      expect(noop.group.members).toHaveLength(2);

      const added = await svc.addMembers(group.id, "u1", ["u2", "u3"]);
      expect(added.group.members).toHaveLength(3);
      expect(added.memberIds.sort()).toEqual(["u1", "u2", "u3"]);
    });

    it("validates added targets all-or-nothing", async () => {
      const group = await newGroup(["u2"]);
      await expect(svc.addMembers(group.id, "u1", ["u3", "u4"])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect((await svc.getGroup(group.id, "u1")).members).toHaveLength(2);
    });

    it("rejects adding someone who blocked, or was blocked by, a current member", async () => {
      const group = await newGroup(["u2"]);
      await db.insert(schema.userBlocks).values({ blockerId: "u3", blockedId: "u2" });
      await expect(svc.addMembers(group.id, "u1", ["u3"])).rejects.toMatchObject({ code: "BLOCKED" });
      expect((await svc.getGroup(group.id, "u1")).members).toHaveLength(2);
    });

    it("only the OWNER can add", async () => {
      const group = await newGroup(["u2"]);
      await makeContacts(db, "u2", "u4");
      await expect(svc.addMembers(group.id, "u2", ["u4"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("non-members", () => {
    it("get 404 on every group route, as does a random uuid", async () => {
      const group = await newGroup();
      for (const id of [group.id, RANDOM_UUID]) {
        await expect(svc.getGroup(id, "u4")).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(svc.listMessages(id, "u4")).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(svc.sendMessage(id, "u4", "hola")).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(svc.markRead(id, "u4")).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(svc.leaveGroup(id, "u4")).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(svc.addMembers(id, "u4", ["u1"])).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    });
  });

  describe("messages", () => {
    it("tracks unread per member, excluding own messages, and clears it on read", async () => {
      const group = await newGroup();
      await svc.sendMessage(group.id, "u1", "uno");
      const { message, memberIds } = await svc.sendMessage(group.id, "u1", "dos");

      expect(message.senderName).toBe("Usuario anónimo");
      expect(message.content).toBe("dos");
      expect(memberIds.sort()).toEqual(["u1", "u2", "u3"]);

      const [forU2] = await svc.listGroups("u2");
      const [forU1] = await svc.listGroups("u1");
      expect(forU2!.unread).toBe(2);
      expect(forU1!.unread).toBe(0);
      expect(forU2!.lastMessage).toMatchObject({ senderId: "u1", content: "dos", deleted: false });
      expect(forU2!.lastMessage!.senderName).toBeTruthy();
      expect(forU2!.lastMessageAt).not.toBeNull();

      await svc.markRead(group.id, "u2");
      expect((await svc.getGroup(group.id, "u2")).unread).toBe(0);
      expect((await svc.getGroup(group.id, "u3")).unread).toBe(2);
    });

    it("updates last_message_at on send", async () => {
      const group = await newGroup();
      expect(group.lastMessageAt).toBeNull();
      const { message } = await svc.sendMessage(group.id, "u2", "hola");
      const [row] = await db.select().from(schema.groupConversations).where(eq(schema.groupConversations.id, group.id));
      expect(row!.lastMessageAt?.toISOString()).toBe(message.createdAt);
    });

    it("refuses to send for a MUTE_CHAT member", async () => {
      const group = await newGroup();
      await db.insert(schema.userRestrictions).values({ userId: "u2", type: "MUTE_CHAT", reason: "t" });
      await expect(svc.sendMessage(group.id, "u2", "hola")).rejects.toMatchObject({ code: "RESTRICTED" });
    });

    it("paginates newest first with a cursor", async () => {
      const group = await newGroup();
      const base = Date.now() - 3_600_000;
      await db.insert(schema.groupMessages).values(
        Array.from({ length: 55 }, (_, i) => ({ groupId: group.id, senderId: "u1", content: `m${i}`, createdAt: new Date(base + i * 1000) })),
      );

      const first = await svc.listMessages(group.id, "u2");
      expect(first.items).toHaveLength(50);
      expect(first.items[0]!.content).toBe("m54");
      expect(first.nextCursor).toBe(first.items[49]!.createdAt);

      const second = await svc.listMessages(group.id, "u2", first.nextCursor);
      expect(second.items).toHaveLength(5);
      expect(second.nextCursor).toBeNull();
    });
  });

  describe("leaveGroup", () => {
    it("keeps the group when a regular member leaves", async () => {
      const group = await newGroup();
      const result = await svc.leaveGroup(group.id, "u2");
      expect(result.deleted).toBe(false);
      expect(result.remainingMemberIds.sort()).toEqual(["u1", "u3"]);
      await expect(svc.getGroup(group.id, "u2")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("promotes the oldest remaining member when the owner leaves", async () => {
      const group = await newGroup();
      await db
        .update(schema.groupMembers)
        .set({ joinedAt: new Date(Date.now() - 10_000) })
        .where(eq(schema.groupMembers.userId, "u3"));

      await svc.leaveGroup(group.id, "u1");
      const view = await svc.getGroup(group.id, "u2");
      expect(view.members.find((m) => m.userId === "u3")!.role).toBe("OWNER");
      expect(view.members.find((m) => m.userId === "u2")!.role).toBe("MEMBER");
      expect(view.myRole).toBe("MEMBER");
    });

    it("deletes the group, with its messages, when the last member leaves", async () => {
      const group = await newGroup(["u2"]);
      await svc.sendMessage(group.id, "u1", "hola");
      await svc.leaveGroup(group.id, "u1");
      const last = await svc.leaveGroup(group.id, "u2");

      expect(last).toEqual({ remainingMemberIds: [], deleted: true });
      expect(await db.select().from(schema.groupConversations)).toHaveLength(0);
      expect(await db.select().from(schema.groupMessages)).toHaveLength(0);
    });
  });

  describe("listContacts", () => {
    it("includes both sides of a conversation and excludes blocked or DM-disabled users", async () => {
      await makeContacts(db, "u4", "u1");
      expect((await svc.listContacts("u1")).map((c) => c.userId).sort()).toEqual(["u2", "u3", "u4"]);
      // u2 only appears as a contact from u2's side because the row is symmetric.
      expect((await svc.listContacts("u2")).map((c) => c.userId)).toEqual(["u1"]);

      await db.insert(schema.userBlocks).values({ blockerId: "u2", blockedId: "u1" });
      await db.insert(schema.userPrivacySettings).values({ userId: "u3", allowDirectMessages: false });
      expect((await svc.listContacts("u1")).map((c) => c.userId)).toEqual(["u4"]);
    });
  });

  describe("listGroups", () => {
    it("sorts by latest activity and uses a constant number of queries", async () => {
      const one = await newGroup(["u2"]);
      const measureOne = await countQueries(() => svc.listGroups("u1"));

      const two = await newGroup(["u3"]);
      const three = await newGroup(["u2", "u3"]);
      await svc.sendMessage(one.id, "u2", "hola");
      const measureThree = await countQueries(() => svc.listGroups("u1"));

      expect(measureThree.queries).toBe(measureOne.queries);
      const ids = (await svc.listGroups("u1")).map((g) => g.id);
      expect(ids).toHaveLength(3);
      expect(ids[0]).toBe(one.id);
      expect(ids.slice(1).sort()).toEqual([two.id, three.id].sort());
    });
  });
});
