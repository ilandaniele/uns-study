import { and, count, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { inChunks, schema, type Db } from "@sala/database";
import type { ConversationDto, DirectMessageDto, Page } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { RestrictionService } from "../users/restriction.service.js";
import { BlocksService } from "../blocks/blocks.service.js";
import { displayName, visibleAvatarUrl } from "../users/display-name.js";
import { AliasService } from "../users/alias.service.js";
import { formatCursor, newestFirst, olderThan, withRowid } from "../chat/page-cursor.js";

const PAGE_SIZE = 50;
/** Hard cap on unpaginated list responses. */
const MAX_LIST_ROWS = 200;

type ConversationRow = typeof schema.directConversations.$inferSelect;

export class DmService {
  constructor(
    private readonly db: Db,
    private readonly restrictions: RestrictionService,
    private readonly blocks: BlocksService,
    private readonly aliases: AliasService,
  ) {}

  /** `direct_conversations` enforces `user_a < user_b`; this returns the pair in that order. */
  private orderPair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  async getOrCreateConversation(requesterId: string, targetId: string): Promise<ConversationDto> {
    if (requesterId === targetId) throw ApiErrors.validation("No podés iniciar una conversación con vos mismo.");

    await this.restrictions.assertNot(requesterId, ["SUSPENDED", "BANNED"]);

    const [target] = await this.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, targetId));
    if (!target) throw ApiErrors.notFound("Usuario no encontrado.");

    if (await this.blocks.isBlockedEitherDirection(requesterId, targetId)) throw ApiErrors.blocked();

    const [privacy] = await this.db.select().from(schema.userPrivacySettings).where(eq(schema.userPrivacySettings.userId, targetId));
    if (privacy && !privacy.allowDirectMessages) throw ApiErrors.dmNotAllowed();

    const [userA, userB] = this.orderPair(requesterId, targetId);
    const conversation = this.db.transaction((tx) => {
      const [existing] = tx
        .select()
        .from(schema.directConversations)
        .where(and(eq(schema.directConversations.userA, userA), eq(schema.directConversations.userB, userB)))
        .all();
      if (existing) return existing;
      return tx.insert(schema.directConversations).values({ userA, userB }).returning().all()[0];
    });

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

    return this.buildDtos(rows, userId);
  }

  async listMessages(conversationId: string, viewerId: string, cursor?: string | null): Promise<Page<DirectMessageDto>> {
    const conversation = await this.getConversationRow(conversationId);
    this.assertParticipant(conversation, viewerId);

    const conditions = [eq(schema.directMessages.conversationId, conversationId)];
    const older = olderThan(schema.directMessages, schema.directMessages.createdAt, cursor);
    if (older) conditions.push(older);

    const rows = await this.db
      .select(withRowid(schema.directMessages))
      .from(schema.directMessages)
      .where(and(...conditions))
      .orderBy(...newestFirst(schema.directMessages, schema.directMessages.createdAt))
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE);
    const last = page[page.length - 1];
    const nextCursor = rows.length > PAGE_SIZE && last ? formatCursor(last.createdAt, last.rowid) : null;

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

    const row = this.db.transaction((tx) => {
      const [inserted] = tx.insert(schema.directMessages).values({ conversationId, senderId, content }).returning().all();
      if (!inserted) throw new Error("Failed to insert direct message");
      tx.update(schema.directConversations).set({ lastMessageAt: inserted.createdAt }).where(eq(schema.directConversations.id, conversationId)).run();
      return inserted;
    });

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

  /** The name `userId` is shown under to other users (identity mode or alias), never their email. */
  async publicDisplayName(userId: string): Promise<string> {
    const [profile] = await this.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId));
    if (!profile) return displayName(null, null, "Usuario");
    const withAlias = await this.aliases.withAlias(profile);
    return displayName(withAlias, null, "Usuario");
  }

  private async toConversationDto(conversation: ConversationRow, viewerId: string): Promise<ConversationDto> {
    const [dto] = await this.buildDtos([conversation], viewerId);
    if (!dto) throw new Error("Failed to build conversation DTO");
    return dto;
  }

  /** Builds DTOs for the viewer's conversations in a constant number of queries, keeping the order of `conversations`. */
  private async buildDtos(conversations: ConversationRow[], viewerId: string): Promise<ConversationDto[]> {
    if (conversations.length === 0) return [];

    const conversationIds = conversations.map((c) => c.id);
    const otherIds = [...new Set(conversations.map((c) => this.otherUserId(c, viewerId)))];

    const users = inChunks(otherIds, (part) => this.db.select().from(schema.user).where(inArray(schema.user.id, part)).all());
    const profileRows = inChunks(otherIds, (part) =>
      this.db.select().from(schema.userProfiles).where(inArray(schema.userProfiles.userId, part)).all(),
    );
    const aliasByUser = await this.aliases.ensureAliasesForProfiles(profileRows);
    const privacyRows = inChunks(otherIds, (part) =>
      this.db.select().from(schema.userPrivacySettings).where(inArray(schema.userPrivacySettings.userId, part)).all(),
    );

    // Latest message per conversation: rank in SQL, then load just the winners.
    const latestIds = inChunks(conversationIds, (part) => {
      const ranked = this.db
        .select({
          id: schema.directMessages.id,
          rn: sql<number>`row_number() over (partition by ${schema.directMessages.conversationId} order by ${schema.directMessages.createdAt} desc, ${schema.directMessages.id} desc)`.as("rn"),
        })
        .from(schema.directMessages)
        .where(inArray(schema.directMessages.conversationId, part))
        .as("ranked");
      return this.db.select({ id: ranked.id }).from(ranked).where(eq(ranked.rn, 1)).all();
    }).map((r) => r.id);
    const lastRows = inChunks(latestIds, (part) => this.db.select().from(schema.directMessages).where(inArray(schema.directMessages.id, part)).all());

    // No read row means everything from the other side is unread.
    const unreadRows = inChunks(conversationIds, (part) =>
      this.db
        .select({ conversationId: schema.directMessages.conversationId, count: count() })
        .from(schema.directMessages)
        .leftJoin(
          schema.directConversationReads,
          and(eq(schema.directConversationReads.conversationId, schema.directMessages.conversationId), eq(schema.directConversationReads.userId, viewerId)),
        )
        .where(
          and(
            inArray(schema.directMessages.conversationId, part),
            ne(schema.directMessages.senderId, viewerId),
            or(isNull(schema.directConversationReads.lastReadAt), gt(schema.directMessages.createdAt, schema.directConversationReads.lastReadAt)),
          ),
        )
        .groupBy(schema.directMessages.conversationId)
        .all(),
    );

    const userById = new Map(users.map((u) => [u.id, u]));
    const profileByUser = new Map(profileRows.map((p) => [p.userId, { ...p, alias: aliasByUser.get(p.userId) ?? p.alias }]));
    const privacyByUser = new Map(privacyRows.map((p) => [p.userId, p]));
    const lastByConversation = new Map(lastRows.map((m) => [m.conversationId, m]));
    const unreadByConversation = new Map(unreadRows.map((r) => [r.conversationId, Number(r.count)]));

    return conversations.map((conversation) => {
      const otherId = this.otherUserId(conversation, viewerId);
      const profile = profileByUser.get(otherId) ?? null;
      const privacy = privacyByUser.get(otherId) ?? null;
      const lastMessageRow = lastByConversation.get(conversation.id);
      return {
        id: conversation.id,
        otherUser: {
          userId: otherId,
          displayName: displayName(profile, privacy, userById.get(otherId)?.name ?? "Usuario"),
          avatarUrl: visibleAvatarUrl(profile, privacy),
        },
        lastMessage: lastMessageRow ? toMessageDto(lastMessageRow) : null,
        unread: unreadByConversation.get(conversation.id) ?? 0,
        lastMessageAt: conversation.lastMessageAt.toISOString(),
      };
    });
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
