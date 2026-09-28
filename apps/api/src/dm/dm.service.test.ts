import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
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
    db = await freshDb();
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

  it("rejects DMs when the target disabled direct messages", async () => {
    await db.insert(schema.userPrivacySettings).values({ userId: "u2", allowDirectMessages: false });
    await expect(svc.getOrCreateConversation("u1", "u2")).rejects.toMatchObject({ code: "DM_NOT_ALLOWED" });
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
});
