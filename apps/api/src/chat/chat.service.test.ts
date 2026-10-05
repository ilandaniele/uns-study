import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { freshDb, insertUsers } from "../test-utils.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RolesService } from "../users/roles.service.js";
import { BlocksService } from "../blocks/blocks.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { AliasService } from "../users/alias.service.js";
import { ChatService } from "./chat.service.js";

async function build(db: Db) {
  const roomState = new RoomStateService(db);
  const rooms = new RoomsService(db, roomState);
  const restrictions = new RestrictionService(db);
  const roles = new RolesService(db);
  const aliases = new AliasService(db);
  const blocks = new BlocksService(db, aliases);
  return new ChatService(db, rooms, restrictions, roles, blocks, aliases);
}

describe("ChatService", () => {
  let db: Db;
  let svc: ChatService;

  beforeEach(async () => {
    db = await freshDb();
    svc = await build(db);
    await insertUsers(db, ["u1", "u2", "mod1"]);
    await db.insert(schema.userRoles).values({ userId: "mod1", role: "MODERATOR" });
  });

  it("posts and lists messages newest first", async () => {
    await svc.createMessage("u1", "principal", "hola");
    await svc.createMessage("u2", "principal", "¿qué tal?");

    const page = await svc.listMessages("principal", "u1");
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.content).toBe("¿qué tal?");
    expect(page.items[1]?.content).toBe("hola");
    expect(page.nextCursor).toBeNull();
  });

  it("paginates with a cursor", async () => {
    for (let i = 0; i < 55; i++) {
      await svc.createMessage("u1", "principal", `msg-${i}`);
    }

    const first = await svc.listMessages("principal", "u1");
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();

    const second = await svc.listMessages("principal", "u1", first.nextCursor);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();

    const seen = new Set([...first.items, ...second.items].map((m) => m.id));
    expect(seen.size).toBe(55);
  });

  it("hides the author's userId when shown as alias, flags the viewer's own messages as mine", async () => {
    await db.insert(schema.userProfiles).values({ userId: "u1", identityMode: "FIRST_NAME", firstName: "Ana" });
    await db.insert(schema.userProfiles).values({ userId: "u2", identityMode: "FIRST_NAME" }); // visible mode, empty name
    const own = await svc.createMessage("u2", "principal", "anon");
    expect(own.mine).toBe(true);
    await svc.createMessage("u1", "principal", "named");

    const page = await svc.listMessages("principal", "u2");
    const named = page.items.find((m) => m.content === "named")!;
    const anon = page.items.find((m) => m.content === "anon")!;
    expect(named.author.userId).toBe("u1");
    expect(named.mine).toBeUndefined();
    expect(anon.author.userId).toBeNull();
    expect(anon.mine).toBe(true);

    const other = await svc.listMessages("principal", "u1");
    expect(other.items.find((m) => m.content === "anon")).toMatchObject({ author: { userId: null } });
    expect(other.items.find((m) => m.content === "anon")?.mine).toBeUndefined();
  });

  it("excludes authors the viewer blocked", async () => {
    await svc.createMessage("u1", "principal", "visible");
    await svc.createMessage("u2", "principal", "blocked-author");
    await db.insert(schema.userBlocks).values({ blockerId: "u1", blockedId: "u2" });

    const page = await svc.listMessages("principal", "u1");
    expect(page.items.map((m) => m.content)).toEqual(["visible"]);
  });

  it("rejects posting while MUTE_CHAT is active", async () => {
    await db.insert(schema.userRestrictions).values({ userId: "u1", type: "MUTE_CHAT", reason: "spam" });
    await expect(svc.createMessage("u1", "principal", "hola")).rejects.toMatchObject({ code: "RESTRICTED" });
  });

  it("lets the owner delete their own message", async () => {
    const msg = await svc.createMessage("u1", "principal", "borrame");
    await svc.deleteMessage(msg.id, "u1");

    const [row] = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, msg.id));
    expect(row?.deletedAt).not.toBeNull();

    const page = await svc.listMessages("principal", "u1");
    expect(page.items[0]?.deleted).toBe(true);
    expect(page.items[0]?.content).toBeNull();
  });

  it("forbids deleting someone else's message when not a moderator", async () => {
    const msg = await svc.createMessage("u1", "principal", "no me borres");
    await expect(svc.deleteMessage(msg.id, "u2")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets a moderator delete anyone's message and records an audit entry", async () => {
    const msg = await svc.createMessage("u1", "principal", "spam");
    await svc.deleteMessage(msg.id, "mod1");

    const [row] = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, msg.id));
    expect(row?.deletedAt).not.toBeNull();

    const audit = await db.select().from(schema.moderationActions);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe("CHAT_MESSAGE_DELETED");
    expect(audit[0]?.actorId).toBe("mod1");
  });

  it("hides the author's avatar when they haven't opted into showAvatar", async () => {
    await db.insert(schema.userProfiles).values({ userId: "u1", avatarUrl: "https://example.test/a.png" });
    await db.insert(schema.userPrivacySettings).values({ userId: "u1", showAvatar: false });
    await svc.createMessage("u1", "principal", "hola");

    const page = await svc.listMessages("principal", "u1");
    expect(page.items[0]?.author.avatarUrl).toBeNull();
  });
});
