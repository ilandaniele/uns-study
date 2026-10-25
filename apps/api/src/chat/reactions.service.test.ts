import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { SocketEvents, type ReactionScope } from "@sala/contracts";
import { freshDb, insertUsers } from "../test-utils.js";
import { RecordingHub } from "../realtime/realtime-hub.js";
import { buildTestApp } from "../http/test-app.js";
import type { ReactionsService } from "./reactions.service.js";

describe("message reactions", () => {
  let db: Db;
  let service: ReactionsService;
  let hub: RecordingHub;
  let ctx: ReturnType<typeof buildTestApp>;
  let threads: Record<ReactionScope, string>;
  let messages: Record<ReactionScope, string>;
  beforeEach(async () => {
    db = freshDb();
    await insertUsers(db, ["u1", "u2", "u3"]);
    ctx = buildTestApp(db);
    hub = ctx.hub;
    service = ctx.services.reactions;
    const room = db.select().from(schema.chatRooms).get()!;
    const dm = db
      .insert(schema.directConversations)
      .values({ userA: "u1", userB: "u2" })
      .returning()
      .get();
    const group = db
      .insert(schema.groupConversations)
      .values({ name: "Synthetic group", createdBy: "u1" })
      .returning()
      .get();
    db.insert(schema.groupMembers)
      .values([
        { groupId: group.id, userId: "u1", role: "OWNER" },
        { groupId: group.id, userId: "u2" },
      ])
      .run();
    threads = { ROOM: room.id, DM: dm.id, GROUP: group.id };
    messages = {
      ROOM: db
        .insert(schema.chatMessages)
        .values({
          chatRoomId: room.id,
          userId: "u1",
          content: "Synthetic message",
        })
        .returning()
        .get().id,
      DM: db
        .insert(schema.directMessages)
        .values({
          conversationId: dm.id,
          senderId: "u1",
          content: "Synthetic private message",
        })
        .returning()
        .get().id,
      GROUP: db
        .insert(schema.groupMessages)
        .values({
          groupId: group.id,
          senderId: "u1",
          content: "Synthetic group message",
        })
        .returning()
        .get().id,
    };
  });
  it.each(["ROOM", "DM", "GROUP"] as const)(
    "persists idempotent set, replace and removal in %s",
    async (scope) => {
      const thread = threads[scope],
        message = messages[scope];
      await service.set(scope, thread, message, "u1", "👍");
      await Promise.all([
        service.set(scope, thread, message, "u2", "👍"),
        service.set(scope, thread, message, "u2", "👍"),
      ]);
      expect(await service.list(scope, thread, [message], "u1")).toEqual({
        [message]: [{ emoji: "👍", count: 2, mine: true }],
      });
      await service.set(scope, thread, message, "u2", "❤️");
      expect(await service.list(scope, thread, [message], "u1")).toEqual({
        [message]: [
          { emoji: "👍", count: 1, mine: true },
          { emoji: "❤️", count: 1, mine: false },
        ],
      });
      await service.set(scope, thread, message, "u2", null);
      await service.set(scope, thread, message, "u2", null);
      expect(db.select().from(schema.messageReactions).all()).toHaveLength(1);
      const events = hub.eventsFor(SocketEvents.MessageReactionChanged);
      expect(events).toHaveLength(scope === "ROOM" ? 4 : 8);
      expect(events[0].payload).toEqual({
        scope,
        threadId: thread,
        messageId: message,
      });
      expect(new Set(events.map((e) => e.to))).toEqual(
        new Set(scope === "ROOM" ? [`chat:${thread}`] : ["user:u1", "user:u2"]),
      );
    },
  );
  it.each(["DM", "GROUP"] as const)(
    "does not leak or mutate private %s threads for nonmembers",
    async (scope) => {
      await expect(
        service.list(scope, threads[scope], [messages[scope]], "u3"),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.set(scope, threads[scope], messages[scope], "u3", "👍"),
      ).rejects.toMatchObject({ status: 404 });
      expect(hub.eventsFor(SocketEvents.MessageReactionChanged)).toEqual([]);
    },
  );
  it("does not accept a message from another thread or a fabricated emoji", async () => {
    await expect(
      service.set("ROOM", threads.ROOM, messages.DM, "u2", "👍"),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await service.list("ROOM", threads.ROOM, [messages.DM], "u2"),
    ).toEqual({});
    await expect(
      service.set("ROOM", threads.ROOM, messages.ROOM, "u2", "<script>"),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("honors blocking in both directions and excludes hidden authors from reads", async () => {
    await ctx.services.blocks.block("u2", "u1");
    for (const scope of ["ROOM", "DM", "GROUP"] as const) {
      await expect(
        service.set(scope, threads[scope], messages[scope], "u2", "👍"),
      ).rejects.toMatchObject({ code: "BLOCKED" });
      expect(
        await service.list(scope, threads[scope], [messages[scope]], "u2"),
      ).toEqual({});
      if (scope === "DM")
        await expect(
          service.set(scope, threads[scope], messages[scope], "u1", "👍"),
        ).rejects.toMatchObject({ code: "BLOCKED" });
      else
        await expect(
          service.set(scope, threads[scope], messages[scope], "u1", "👍"),
        ).resolves.toBeDefined();
    }
    await ctx.services.blocks.unblock("u2", "u1");
    await ctx.services.blocks.block("u1", "u2");
    await expect(
      service.set("ROOM", threads.ROOM, messages.ROOM, "u2", "👍"),
    ).rejects.toMatchObject({ code: "BLOCKED" });
  });
  it("does not let a DM sender react after the other participant blocks them", async () => {
    await ctx.services.blocks.block("u2", "u1");
    await expect(
      service.set("DM", threads.DM, messages.DM, "u1", "👍"),
    ).rejects.toMatchObject({ code: "BLOCKED" });
  });
  it("rejects deleted messages and cascades physical deletion", async () => {
    await service.set("ROOM", threads.ROOM, messages.ROOM, "u2", "👍");
    db.update(schema.chatMessages)
      .set({ deletedAt: new Date() })
      .where(eq(schema.chatMessages.id, messages.ROOM))
      .run();
    await expect(
      service.set("ROOM", threads.ROOM, messages.ROOM, "u2", "❤️"),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await service.list("ROOM", threads.ROOM, [messages.ROOM], "u2"),
    ).toEqual({});
    db.delete(schema.chatMessages)
      .where(eq(schema.chatMessages.id, messages.ROOM))
      .run();
    expect(db.select().from(schema.messageReactions).all()).toEqual([]);
  });
  it("rechecks membership within the write transaction if a member leaves during permission checks", async () => {
    vi.spyOn(
      ctx.services.blocks,
      "isBlockedEitherDirection",
    ).mockImplementationOnce(async () => {
      db.delete(schema.groupMembers)
        .where(
          and(
            eq(schema.groupMembers.groupId, threads.GROUP),
            eq(schema.groupMembers.userId, "u2"),
          ),
        )
        .run();
      return false;
    });
    await expect(
      service.set("GROUP", threads.GROUP, messages.GROUP, "u2", "👍"),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.select().from(schema.messageReactions).all()).toEqual([]);
  });
  it("does not expose identities in aggregate responses and deletes reactions with an account", async () => {
    await service.set("GROUP", threads.GROUP, messages.GROUP, "u2", "🐶");
    const data = await service.list(
      "GROUP",
      threads.GROUP,
      [messages.GROUP],
      "u1",
    );
    expect(JSON.stringify(data)).not.toContain("u2");
    db.delete(schema.user).where(eq(schema.user.id, "u2")).run();
    expect(db.select().from(schema.messageReactions).all()).toEqual([]);
  });
});
