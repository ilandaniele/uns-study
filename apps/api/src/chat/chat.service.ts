import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, lt, notInArray } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { ChatHistoryDto, ChatMessageDto } from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RolesService } from "../users/roles.service.js";
import { BlocksService } from "../blocks/blocks.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { displayName, shownAliasAnimal, visibleAvatarUrl } from "../users/display-name.js";
import { AliasService } from "../users/alias.service.js";

const PAGE_SIZE = 50;

@Injectable()
export class ChatService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(BlocksService) private readonly blocks: BlocksService,
    @Inject(AliasService) private readonly aliases: AliasService,
  ) {}

  /** Every seeded room has exactly one chat room row; this picks the first one for `idOrSlug`. */
  async resolveChatRoom(idOrSlug: string): Promise<typeof schema.chatRooms.$inferSelect> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    const [chatRoom] = await this.db.select().from(schema.chatRooms).where(eq(schema.chatRooms.roomId, room.id)).limit(1);
    if (!chatRoom) throw ApiErrors.notFound("No hay chat para esta sala.");
    return chatRoom;
  }

  async listMessages(idOrSlug: string, viewerId: string, cursor?: string | null): Promise<ChatHistoryDto> {
    const chatRoom = await this.resolveChatRoom(idOrSlug);
    const blockedByMe = await this.blocks.blockedByMe(viewerId);

    const conditions = [eq(schema.chatMessages.chatRoomId, chatRoom.id)];
    if (blockedByMe.length > 0) conditions.push(notInArray(schema.chatMessages.userId, blockedByMe));
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) conditions.push(lt(schema.chatMessages.createdAt, cursorDate));
    }

    const rows = await this.db
      .select()
      .from(schema.chatMessages)
      .where(and(...conditions))
      .orderBy(desc(schema.chatMessages.createdAt))
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE);
    const nextCursor = rows.length > PAGE_SIZE ? page[page.length - 1]!.createdAt.toISOString() : null;

    const items = await this.toDtos(page);
    return { items, nextCursor, chatRoomId: chatRoom.id };
  }

  async createMessage(userId: string, idOrSlug: string, content: string): Promise<ChatMessageDto> {
    await this.restrictions.assertNot(userId, ["MUTE_CHAT", "SUSPENDED", "BANNED"]);
    const chatRoom = await this.resolveChatRoom(idOrSlug);

    const [row] = await this.db
      .insert(schema.chatMessages)
      .values({ chatRoomId: chatRoom.id, userId, content })
      .returning();
    if (!row) throw new Error("Failed to insert chat message");

    const [dto] = await this.toDtos([row]);
    return dto!;
  }

  /** Owner may delete their own message; ADMIN/MODERATOR may delete anyone's (audited). */
  async deleteMessage(messageId: string, actingUserId: string): Promise<{ chatRoomId: string }> {
    const [message] = await this.db.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, messageId));
    if (!message) throw ApiErrors.notFound("Mensaje no encontrado.");

    const isOwner = message.userId === actingUserId;
    if (!isOwner) {
      const isModerator = await this.roles.hasRole(actingUserId, ["ADMIN", "MODERATOR"]);
      if (!isModerator) throw ApiErrors.forbidden("No podés borrar el mensaje de otra persona.");
    }

    await this.db.update(schema.chatMessages).set({ deletedAt: new Date() }).where(eq(schema.chatMessages.id, messageId));

    if (!isOwner) {
      await this.db.insert(schema.moderationActions).values({
        actorId: actingUserId,
        targetUserId: message.userId,
        action: "CHAT_MESSAGE_DELETED",
        metadata: { messageId },
      });
    }

    return { chatRoomId: message.chatRoomId };
  }

  private async toDtos(rows: (typeof schema.chatMessages.$inferSelect)[]): Promise<ChatMessageDto[]> {
    if (rows.length === 0) return [];
    const userIds = [...new Set(rows.map((r) => r.userId))];

    const users = await this.db.select().from(schema.user).where(inArray(schema.user.id, userIds));
    const profiles = await this.db.select().from(schema.userProfiles).where(inArray(schema.userProfiles.userId, userIds));
    const privacy = await this.db.select().from(schema.userPrivacySettings).where(inArray(schema.userPrivacySettings.userId, userIds));
    const aliasByUser = await this.aliases.ensureAliasesForProfiles(profiles);

    const userById = new Map(users.map((u) => [u.id, u]));
    const profileById = new Map(profiles.map((p) => [p.userId, { ...p, alias: aliasByUser.get(p.userId) ?? p.alias }]));
    const privacyById = new Map(privacy.map((p) => [p.userId, p]));

    return rows.map((row) => {
      const deleted = row.deletedAt !== null;
      const fallbackName = userById.get(row.userId)?.name ?? "Usuario";
      return {
        id: row.id,
        chatRoomId: row.chatRoomId,
        author: {
          userId: row.userId,
          displayName: displayName(profileById.get(row.userId) ?? null, privacyById.get(row.userId) ?? null, fallbackName),
          avatarUrl: visibleAvatarUrl(profileById.get(row.userId) ?? null, privacyById.get(row.userId) ?? null),
          aliasAnimal: shownAliasAnimal(profileById.get(row.userId) ?? null) ?? undefined,
        },
        content: deleted ? null : row.content,
        deleted,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}
