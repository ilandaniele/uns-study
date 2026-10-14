import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { ChatHistoryDto, ChatMessageDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RolesService } from "../users/roles.service.js";
import { BlocksService } from "../blocks/blocks.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { displayName, needsAlias, showsAdminBadge, shownAliasAnimal, visibleAvatarUrl } from "../users/display-name.js";
import { AliasService } from "../users/alias.service.js";
import { formatCursor, newestFirst, olderThan, withRowid } from "./page-cursor.js";

const PAGE_SIZE = 50;

export class ChatService {
  constructor(
    private readonly db: Db,
    private readonly rooms: RoomsService,
    private readonly restrictions: RestrictionService,
    private readonly roles: RolesService,
    private readonly blocks: BlocksService,
    private readonly aliases: AliasService,
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
    // One bound parameter however long the block list is (SQLite caps bound parameters at 100).
    if (blockedByMe.length > 0) {
      conditions.push(sql`${schema.chatMessages.userId} not in (select value from json_each(${JSON.stringify(blockedByMe)}))`);
    }
    const older = olderThan(schema.chatMessages, schema.chatMessages.createdAt, cursor);
    if (older) conditions.push(older);

    const rows = await this.db
      .select(withRowid(schema.chatMessages))
      .from(schema.chatMessages)
      .where(and(...conditions))
      .orderBy(...newestFirst(schema.chatMessages, schema.chatMessages.createdAt))
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE);
    const last = page[page.length - 1];
    const nextCursor = rows.length > PAGE_SIZE && last ? formatCursor(last.createdAt, last.rowid) : null;

    const items = await this.toDtos(page, viewerId);
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

    const [dto] = await this.toDtos([row], userId);
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

  private async toDtos(rows: (typeof schema.chatMessages.$inferSelect)[], viewerId?: string): Promise<ChatMessageDto[]> {
    if (rows.length === 0) return [];
    const userIds = [...new Set(rows.map((r) => r.userId))];

    const users = await this.db.select().from(schema.user).where(inArray(schema.user.id, userIds));
    const profiles = await this.db.select().from(schema.userProfiles).where(inArray(schema.userProfiles.userId, userIds));
    const privacy = await this.db.select().from(schema.userPrivacySettings).where(inArray(schema.userPrivacySettings.userId, userIds));
    const aliasByUser = await this.aliases.ensureAliasesForProfiles(profiles);
    const admins = await this.roles.adminIds(userIds);

    const userById = new Map(users.map((u) => [u.id, u]));
    const profileById = new Map(profiles.map((p) => [p.userId, { ...p, alias: aliasByUser.get(p.userId) ?? p.alias }]));
    const privacyById = new Map(privacy.map((p) => [p.userId, p]));

    return rows.map((row) => {
      const deleted = row.deletedAt !== null;
      const fallbackName = userById.get(row.userId)?.name ?? "Usuario";
      const profile = profileById.get(row.userId) ?? null;
      const privacy = privacyById.get(row.userId) ?? null;
      const asAlias = !profile || needsAlias(profile);
      return {
        id: row.id,
        chatRoomId: row.chatRoomId,
        author: {
          // Alias authors stay unlinkable to their account; actions go by message id instead.
          userId: asAlias ? null : row.userId,
          displayName: displayName(profile, privacy, fallbackName),
          // The photo belongs to the real identity: never shown next to the alias.
          avatarUrl: visibleAvatarUrl(profile, privacy),
          aliasAnimal: shownAliasAnimal(profile) ?? undefined,
          adminBadge: showsAdminBadge(admins.has(row.userId), profile, privacy),
        },
        content: deleted ? null : row.content,
        deleted,
        createdAt: row.createdAt.toISOString(),
        ...(viewerId !== undefined && row.userId === viewerId ? { mine: true } : {}),
      };
    });
  }
}
