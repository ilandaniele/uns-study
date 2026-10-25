import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import {
  CHAT_REACTION_EMOJIS,
  SocketEvents,
  type MessageReactionsDto,
  type ReactionScope,
} from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import type { BlocksService } from "../blocks/blocks.service.js";
import type { RestrictionService } from "../users/restriction.service.js";
import type { RealtimeHub } from "../realtime/realtime-hub.js";

export class ReactionsService {
  constructor(
    private readonly db: Db,
    private readonly blocks: BlocksService,
    private readonly restrictions: RestrictionService,
    private readonly hub: RealtimeHub,
  ) {}

  private thread(
    scope: ReactionScope,
    threadId: string,
    viewerId: string,
  ): string[] {
    if (scope === "ROOM") {
      if (
        !this.db
          .select({ id: schema.chatRooms.id })
          .from(schema.chatRooms)
          .where(eq(schema.chatRooms.id, threadId))
          .get()
      )
        throw ApiErrors.notFound();
      return [];
    }
    if (scope === "DM") {
      const c = this.db
        .select()
        .from(schema.directConversations)
        .where(eq(schema.directConversations.id, threadId))
        .get();
      if (!c || (c.userA !== viewerId && c.userB !== viewerId))
        throw ApiErrors.notFound();
      return [c.userA, c.userB];
    }
    const members = this.db
      .select({ id: schema.groupMembers.userId })
      .from(schema.groupMembers)
      .where(eq(schema.groupMembers.groupId, threadId))
      .all();
    if (!members.some((m) => m.id === viewerId)) throw ApiErrors.notFound();
    return members.map((m) => m.id);
  }

  private messages(scope: ReactionScope, threadId: string, ids: string[]) {
    if (scope === "ROOM")
      return this.db
        .select({
          id: schema.chatMessages.id,
          authorId: schema.chatMessages.userId,
        })
        .from(schema.chatMessages)
        .where(
          and(
            eq(schema.chatMessages.chatRoomId, threadId),
            inArray(schema.chatMessages.id, ids),
            isNull(schema.chatMessages.deletedAt),
          ),
        )
        .all();
    if (scope === "DM")
      return this.db
        .select({
          id: schema.directMessages.id,
          authorId: schema.directMessages.senderId,
        })
        .from(schema.directMessages)
        .where(
          and(
            eq(schema.directMessages.conversationId, threadId),
            inArray(schema.directMessages.id, ids),
            isNull(schema.directMessages.deletedAt),
          ),
        )
        .all();
    return this.db
      .select({
        id: schema.groupMessages.id,
        authorId: schema.groupMessages.senderId,
      })
      .from(schema.groupMessages)
      .where(
        and(
          eq(schema.groupMessages.groupId, threadId),
          inArray(schema.groupMessages.id, ids),
          isNull(schema.groupMessages.deletedAt),
        ),
      )
      .all();
  }

  async list(
    scope: ReactionScope,
    threadId: string,
    ids: string[],
    viewerId: string,
  ): Promise<MessageReactionsDto> {
    this.thread(scope, threadId, viewerId);
    const blocked = new Set(await this.blocks.blockedByMe(viewerId));
    const visible = this.messages(scope, threadId, ids)
      .filter((m) => !blocked.has(m.authorId))
      .map((m) => m.id);
    const result: MessageReactionsDto = Object.fromEntries(
      visible.map((id) => [id, []]),
    );
    if (!visible.length) return result;
    const column = this.column(scope);
    const rows = this.db
      .select({
        messageId: column,
        emoji: schema.messageReactions.emoji,
        userId: schema.messageReactions.userId,
      })
      .from(schema.messageReactions)
      .where(inArray(column, visible))
      .all();
    for (const row of rows) {
      if (!row.messageId) continue;
      const counts = result[row.messageId]!;
      let count = counts.find((r) => r.emoji === row.emoji);
      if (!count) {
        count = { emoji: row.emoji, count: 0, mine: false };
        counts.push(count);
      }
      count.count++;
      count.mine ||= row.userId === viewerId;
    }
    for (const counts of Object.values(result))
      counts.sort(
        (a, b) =>
          CHAT_REACTION_EMOJIS.indexOf(
            a.emoji as (typeof CHAT_REACTION_EMOJIS)[number],
          ) -
          CHAT_REACTION_EMOJIS.indexOf(
            b.emoji as (typeof CHAT_REACTION_EMOJIS)[number],
          ),
      );
    return result;
  }

  async set(
    scope: ReactionScope,
    threadId: string,
    messageId: string,
    viewerId: string,
    emoji: string | null,
  ): Promise<MessageReactionsDto> {
    if (emoji !== null && !CHAT_REACTION_EMOJIS.some((e) => e === emoji))
      throw ApiErrors.validation();
    await this.restrictions.assertNot(viewerId, [
      "MUTE_CHAT",
      "SUSPENDED",
      "BANNED",
    ]);
    let recipients = this.thread(scope, threadId, viewerId);
    const message = this.messages(scope, threadId, [messageId])[0];
    if (!message) throw ApiErrors.notFound("Mensaje no disponible.");
    if (await this.blocks.isBlockedEitherDirection(viewerId, message.authorId))
      throw ApiErrors.blocked();
    if (scope === "DM") {
      const other = recipients.find((id) => id !== viewerId)!;
      if (await this.blocks.isBlockedEitherDirection(viewerId, other))
        throw ApiErrors.blocked();
    }
    const column = this.column(scope);
    const changed = this.db.transaction((tx) => {
      recipients = this.thread(scope, threadId, viewerId);
      if (!this.messages(scope, threadId, [messageId]).length)
        throw ApiErrors.notFound("Mensaje no disponible.");
      const others = [
        message.authorId,
        ...(scope === "DM" ? recipients.filter((id) => id !== viewerId) : []),
      ];
      const blocked = tx
        .select({ id: schema.userBlocks.blockedId })
        .from(schema.userBlocks)
        .where(
          or(
            and(
              eq(schema.userBlocks.blockerId, viewerId),
              inArray(schema.userBlocks.blockedId, others),
            ),
            and(
              eq(schema.userBlocks.blockedId, viewerId),
              inArray(schema.userBlocks.blockerId, others),
            ),
          ),
        )
        .get();
      if (blocked) throw ApiErrors.blocked();
      const where = and(
        eq(column, messageId),
        eq(schema.messageReactions.userId, viewerId),
      );
      const prior = tx
        .select()
        .from(schema.messageReactions)
        .where(where)
        .get();
      if ((prior?.emoji ?? null) === emoji) return false;
      if (emoji === null) tx.delete(schema.messageReactions).where(where).run();
      else
        tx.insert(schema.messageReactions)
          .values({
            userId: viewerId,
            emoji,
            updatedAt: new Date(),
            ...(scope === "ROOM"
              ? { chatMessageId: messageId }
              : scope === "DM"
                ? { directMessageId: messageId }
                : { groupMessageId: messageId }),
          })
          .onConflictDoUpdate({
            target: [column, schema.messageReactions.userId],
            set: { emoji, updatedAt: new Date() },
          })
          .run();
      return true;
    });
    if (changed) {
      const event = { scope, threadId, messageId };
      if (scope === "ROOM")
        this.hub.publishToChat(
          threadId,
          SocketEvents.MessageReactionChanged,
          event,
        );
      else
        for (const id of recipients)
          this.hub.publishToUser(
            id,
            SocketEvents.MessageReactionChanged,
            event,
          );
    }
    return this.list(scope, threadId, [messageId], viewerId);
  }

  private column(scope: ReactionScope) {
    return scope === "ROOM"
      ? schema.messageReactions.chatMessageId
      : scope === "DM"
        ? schema.messageReactions.directMessageId
        : schema.messageReactions.groupMessageId;
  }
}
