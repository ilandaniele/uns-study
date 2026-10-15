import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { RestrictionService } from "../users/restriction.service.js";
import { AliasService } from "../users/alias.service.js";
import { BlocksService } from "../blocks/blocks.service.js";
import { DmService } from "./dm.service.js";

async function build(db: Db) {
  const restrictions = new RestrictionService(db);
  const aliases = new AliasService(db);
  const blocks = new BlocksService(db, aliases);
  return new DmService(db, restrictions, blocks, aliases);
}

describe("DmService", () => {
  let db: Db;
  let svc: DmService;

  beforeEach(async () => {
    db = freshDb();
    svc = await build(db);
    await insertUsers(db, ["u1", "u2", "u3"]);
  });

  it("gets or creates the same conversation regardless of who initiates", async () => {
    const fromA = await svc.getOrCreateConversation("u1", "u2");
    const fromB = await svc.getOrCreateConversation("u2", "u1");
    expect(fromB.id).toBe(fromA.id);

    const rows = await db.select().from(schema.directConversations);
    expect(rows).toHaveLength(1);
  });

  it("refuses to open a conversation for a SUSPENDED or BANNED requester", async () => {
    await db.insert(schema.userRestrictions).values({ userId: "u1", type: "BANNED", reason: "t" });
    await db.insert(schema.userRestrictions).values({ userId: "u3", type: "SUSPENDED", reason: "t" });
    await expect(svc.getOrCreateConversation("u1", "u2")).rejects.toMatchObject({ code: "RESTRICTED" });
    await expect(svc.getOrCreateConversation("u3", "u2")).rejects.toMatchObject({ code: "RESTRICTED" });
  });

  it("rejects DMs when the target disabled direct messages", async () => {
    await db.insert(schema.userPrivacySettings).values({ userId: "u2", allowDirectMessages: false });
    await expect(svc.getOrCreateConversation("u1", "u2")).rejects.toMatchObject({ code: "DM_NOT_ALLOWED" });
  });

  it("returns not found when the target user does not exist", async () => {
    await expect(svc.getOrCreateConversation("u1", "ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects DMs when either user has blocked the other", async () => {
    await db.insert(schema.userBlocks).values({ blockerId: "u2", blockedId: "u1" });
    await expect(svc.getOrCreateConversation("u1", "u2")).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(svc.getOrCreateConversation("u2", "u1")).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("blocks sending into an existing conversation after a later block", async () => {
    const conversation = await svc.getOrCreateConversation("u1", "u2");
    await svc.sendMessage(conversation.id, "u1", "hola");

    await db.insert(schema.userBlocks).values({ blockerId: "u2", blockedId: "u1" });
    await expect(svc.sendMessage(conversation.id, "u1", "de nuevo")).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("rejects sending after the recipient disables direct messages mid-conversation", async () => {
    const conversation = await svc.getOrCreateConversation("u1", "u2");
    await svc.sendMessage(conversation.id, "u1", "hola");

    await db.insert(schema.userPrivacySettings).values({ userId: "u2", allowDirectMessages: false });
    await expect(svc.sendMessage(conversation.id, "u1", "de nuevo")).rejects.toMatchObject({ code: "DM_NOT_ALLOWED" });
  });

  it("hides the other user's avatar when they haven't opted into showAvatar", async () => {
    await db.insert(schema.userProfiles).values({ userId: "u2", avatarUrl: "https://example.test/a.png" });
    await db.insert(schema.userPrivacySettings).values({ userId: "u2", showAvatar: false });

    const conversation = await svc.getOrCreateConversation("u1", "u2");
    expect(conversation.otherUser.avatarUrl).toBeNull();
  });

  it("rejects a non-participant with 403 and an unknown conversation with 404", async () => {
    const conversation = await svc.getOrCreateConversation("u1", "u2");
    await expect(svc.listMessages(conversation.id, "u3")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.listMessages("00000000-0000-0000-0000-000000000000", "u1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("tracks unread count and clears it on read", async () => {
    const conversation = await svc.getOrCreateConversation("u1", "u2");
    await svc.sendMessage(conversation.id, "u1", "uno");
    await svc.sendMessage(conversation.id, "u1", "dos");

    const listForU2 = await svc.listConversations("u2");
    expect(listForU2[0]?.unread).toBe(2);

    await svc.markRead(conversation.id, "u2");
    const afterRead = await svc.listConversations("u2");
    expect(afterRead[0]?.unread).toBe(0);
  });

  it("does not rewrite the read marker when already read up to the latest message", async () => {
    const conversation = await svc.getOrCreateConversation("u1", "u2");
    await svc.sendMessage(conversation.id, "u1", "uno");
    await svc.markRead(conversation.id, "u2");
    const readRows = () => db.select().from(schema.directConversationReads).where(eq(schema.directConversationReads.userId, "u2"));
    const [first] = await readRows();

    await new Promise((r) => setTimeout(r, 5));
    await svc.markRead(conversation.id, "u2");
    expect((await readRows())[0]?.lastReadAt).toEqual(first?.lastReadAt);

    await new Promise((r) => setTimeout(r, 5));
    await svc.sendMessage(conversation.id, "u1", "dos");
    await svc.markRead(conversation.id, "u2");
    expect((await readRows())[0]!.lastReadAt.getTime()).toBeGreaterThan(first!.lastReadAt.getTime());
  });

  it("paginates messages with a cursor", async () => {
    const conversation = await svc.getOrCreateConversation("u1", "u2");
    for (let i = 0; i < 55; i++) {
      await svc.sendMessage(conversation.id, "u1", `msg-${i}`);
    }

    const first = await svc.listMessages(conversation.id, "u1");
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();

    const second = await svc.listMessages(conversation.id, "u1", first.nextCursor);
    expect(second.items).toHaveLength(5);
  });

  it("rejects sending while MUTE_CHAT is active", async () => {
    const conversation = await svc.getOrCreateConversation("u1", "u2");
    await db.insert(schema.userRestrictions).values({ userId: "u1", type: "MUTE_CHAT", reason: "spam" });
    await expect(svc.sendMessage(conversation.id, "u1", "hola")).rejects.toMatchObject({ code: "RESTRICTED" });
  });

  it("batches a multi-conversation list with per-conversation unread, last message, ordering and privacy", async () => {
    await insertUsers(db, ["u4"]);
    await db.insert(schema.userProfiles).values([
      { userId: "u2", identityMode: "FIRST_NAME", firstName: "Ana", avatarUrl: "https://example.test/a.png" },
      { userId: "u3", avatarUrl: "https://example.test/b.png" },
    ]);
    await db.insert(schema.userPrivacySettings).values([
      { userId: "u2", showAvatar: true },
      { userId: "u3", showAvatar: false },
    ]);

    const c2 = await svc.getOrCreateConversation("u1", "u2");
    const c3 = await svc.getOrCreateConversation("u1", "u3");
    const c4 = await svc.getOrCreateConversation("u1", "u4");

    await svc.sendMessage(c2.id, "u2", "a1");
    await svc.sendMessage(c2.id, "u2", "a2");
    await svc.sendMessage(c3.id, "u3", "b1");
    await svc.markRead(c3.id, "u1");
    // SQLite timestamps have millisecond resolution: keep the next message strictly after the read mark.
    await new Promise((resolve) => setTimeout(resolve, 2));
    await svc.sendMessage(c3.id, "u3", "b2");
    await svc.sendMessage(c3.id, "u1", "mine");
    await svc.sendMessage(c2.id, "u1", "reply"); // own message never counts as unread

    const list = await svc.listConversations("u1");
    expect(list.map((c) => c.id)).toEqual([c2.id, c3.id, c4.id]);

    const byId = new Map(list.map((c) => [c.id, c]));
    expect(byId.get(c2.id)).toMatchObject({
      unread: 2,
      lastMessage: { content: "reply", senderId: "u1" },
      otherUser: { userId: "u2", displayName: "Ana", avatarUrl: "https://example.test/a.png" },
    });
    expect(byId.get(c3.id)).toMatchObject({ unread: 1, lastMessage: { content: "mine" }, otherUser: { userId: "u3", avatarUrl: null } });
    expect(byId.get(c4.id)).toMatchObject({ unread: 0, lastMessage: null, otherUser: { userId: "u4" } });

    // The single-conversation path must agree with the batched one.
    expect(await svc.getOrCreateConversation("u1", "u3")).toEqual(byId.get(c3.id));
  });
});
