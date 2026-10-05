import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gt, lt, ne, or } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { ConversationDto, DirectMessageDto, Page } from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { RestrictionService } from "../users/restriction.service.js";
import { BlocksService } from "../blocks/blocks.service.js";
import { displayName, visibleAvatarUrl } from "../users/display-name.js";
import { AliasService } from "../users/alias.service.js";

const PAGE_SIZE = 50;
/** Hard cap on unpaginated list responses. */
const MAX_LIST_ROWS = 200;

type ConversationRow = typeof schema.directConversations.$inferSelect;

@Injectable()
export class DmService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
    @Inject(BlocksService) private readonly blocks: BlocksService,
    @Inject(AliasService) private readonly aliases: AliasService,
  ) {}

  /** `direct_conversations` enforces `user_a < user_b`; this returns the pair in that order. */
  private orderPair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  async getOrCreateConversation(requesterId: string, targetId: string): Promise<ConversationDto> {
    if (requesterId === targetId) throw ApiErrors.validation("No podés iniciar una conversación con vos mismo.");

    await this.restrictions.assertNot(requesterId, ["SUSPENDED", "BANNED"]);

    if (await this.blocks.isBlockedEitherDirection(requesterId, targetId)) throw ApiErrors.blocked();

    const [privacy] = await this.db.select().from(schema.userPrivacySettings).where(eq(schema.userPrivacySettings.userId, targetId));
    if (privacy && !privacy.allowDirectMessages) throw ApiErrors.dmNotAllowed();

    const [userA, userB] = this.orderPair(requesterId, targetId);
    const [existing] = await this.db
      .select()
      .from(schema.directConversations)
      .where(and(eq(schema.directConversations.userA, userA), eq(schema.directConversations.userB, userB)));

    const conversation =
      existing ??
      (
        await this.db
          .insert(schema.directConversations)
          .values({ userA, userB })
          .onConflictDoNothing()
          .returning()
      )[0] ??
      (await this.db
        .select()
        .from(schema.directConversations)
        .where(and(eq(schema.directConversations.userA, userA), eq(schema.directConversations.userB, userB))))[0];

    if (!conversation) throw new Error("Failed to get or create conversation");
    return this.toConversationDto(conversation, requesterId);
  }

  async getConversationRow(conversationId: string): Promise<ConversationRow> {
    const [row] = await this.db.select().from(schema.directConversations).where(eq(schema.directConversations.id, conversationId));
    if (!row) throw ApiErrors.notFound("Conversación no encontrada.");
    return row;
  }

  assertParticipant(conversation: ConversationRow, userId: string): void {
    if (conversation.userA !== userId && conversation.userB !== userId) {
      throw ApiErrors.forbidden("No participás de esta conversación.");
    }
  }

  private otherUserId(conversation: ConversationRow, userId: string): string {
    return conversation.userA === userId ? conversation.userB : conversation.userA;
  }

  async listConversations(userId: string): Promise<ConversationDto[]> {
    const rows = await this.db
      .select()
      .from(schema.directConversations)
      .where(or(eq(schema.directConversations.userA, userId), eq(schema.directConversations.userB, userId)))
      .orderBy(desc(schema.directConversations.lastMessageAt))
      .limit(MAX_LIST_ROWS);

    return Promise.all(rows.map((row) => this.toConversationDto(row, userId)));
  }

  async listMessages(conversationId: string, viewerId: string, cursor?: string | null): Promise<Page<DirectMessageDto>> {
    const conversation = await this.getConversationRow(conversationId);
    this.assertParticipant(conversation, viewerId);

    const conditions = [eq(schema.directMessages.conversationId, conversationId)];
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) conditions.push(lt(schema.directMessages.createdAt, cursorDate));
    }

    const rows = await this.db
      .select()
      .from(schema.directMessages)
      .where(and(...conditions))
      .orderBy(desc(schema.directMessages.createdAt))
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE);
    const nextCursor = rows.length > PAGE_SIZE ? page[page.length - 1]!.createdAt.toISOString() : null;

    return { items: page.map(toMessageDto), nextCursor };
  }

  async sendMessage(conversationId: string, senderId: string, content: string): Promise<DirectMessageDto> {
    const conversation = await this.getConversationRow(conversationId);
    this.assertParticipant(conversation, senderId);
    const recipientId = this.otherUserId(conversation, senderId);

    if (await this.blocks.isBlockedEitherDirection(senderId, recipientId)) throw ApiErrors.blocked();
    await this.restrictions.assertNot(senderId, ["MUTE_CHAT", "SUSPENDED", "BANNED"]);

    // The recipient may have disabled DMs after the conversation was created — re-check on every send.
    const [recipientPrivacy] = await this.db.select().from(schema.userPrivacySettings).where(eq(schema.userPrivacySettings.userId, recipientId));
    if (recipientPrivacy && !recipientPrivacy.allowDirectMessages) throw ApiErrors.dmNotAllowed();

    const [row] = await this.db.insert(schema.directMessages).values({ conversationId, senderId, content }).returning();
    if (!row) throw new Error("Failed to insert direct message");

    await this.db
      .update(schema.directConversations)
      .set({ lastMessageAt: row.createdAt })
      .where(eq(schema.directConversations.id, conversationId));

    return toMessageDto(row);
  }

  async markRead(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.getConversationRow(conversationId);
    this.assertParticipant(conversation, userId);

    await this.db
      .insert(schema.directConversationReads)
      .values({ conversationId, userId, lastReadAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.directConversationReads.conversationId, schema.directConversationReads.userId],
        set: { lastReadAt: new Date() },
      });
  }

  /** The other participant's user id, given a conversation id and one of its participants. */
  async otherParticipant(conversationId: string, userId: string): Promise<string> {
    const conversation = await this.getConversationRow(conversationId);
    return this.otherUserId(conversation, userId);
  }

  private async toConversationDto(conversation: ConversationRow, viewerId: string): Promise<ConversationDto> {
    const otherId = this.otherUserId(conversation, viewerId);

    const [otherUser] = await this.db.select().from(schema.user).where(eq(schema.user.id, otherId));
    const [profileRow] = await this.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, otherId));
    const profile = await this.aliases.withAlias(profileRow);
    const [privacy] = await this.db.select().from(schema.userPrivacySettings).where(eq(schema.userPrivacySettings.userId, otherId));

    const [lastMessageRow] = await this.db
      .select()
      .from(schema.directMessages)
      .where(eq(schema.directMessages.conversationId, conversation.id))
      .orderBy(desc(schema.directMessages.createdAt))
      .limit(1);

    const [readRow] = await this.db
      .select()
      .from(schema.directConversationReads)
      .where(and(eq(schema.directConversationReads.conversationId, conversation.id), eq(schema.directConversationReads.userId, viewerId)));

    const unreadConditions = [eq(schema.directMessages.conversationId, conversation.id), ne(schema.directMessages.senderId, viewerId)];
    if (readRow) unreadConditions.push(gt(schema.directMessages.createdAt, readRow.lastReadAt));
    const unreadRows = await this.db
      .select()
      .from(schema.directMessages)
      .where(and(...unreadConditions));

    return {
      id: conversation.id,
      otherUser: {
        userId: otherId,
        displayName: displayName(profile ?? null, privacy ?? null, otherUser?.name ?? "Usuario"),
        avatarUrl: visibleAvatarUrl(profile ?? null, privacy ?? null),
      },
      lastMessage: lastMessageRow ? toMessageDto(lastMessageRow) : null,
      unread: unreadRows.length,
      lastMessageAt: conversation.lastMessageAt.toISOString(),
    };
  }
}

function toMessageDto(row: typeof schema.directMessages.$inferSelect): DirectMessageDto {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    content: deleted ? null : row.content,
    deleted,
    createdAt: row.createdAt.toISOString(),
  };
}
