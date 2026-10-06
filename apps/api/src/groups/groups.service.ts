import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import {
  GROUP_MAX_MEMBERS,
  type CreateGroupInput,
  type GroupContactDto,
  type GroupConversationDto,
  type GroupMemberDto,
  type GroupMessageDto,
  type GroupRole,
  type Page,
} from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { RestrictionService } from "../users/restriction.service.js";
import { BlocksService } from "../blocks/blocks.service.js";
import { AliasService } from "../users/alias.service.js";
import { displayName, shownAliasAnimal, visibleAvatarUrl } from "../users/display-name.js";

const PAGE_SIZE = 50;
/** Hard cap on unpaginated list responses. */
const MAX_LIST_ROWS = 200;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either the pool or a transaction: both can run the read queries below. */
type Executor = Db | Tx;

interface Identity {
  displayName: string;
  avatarUrl: string | null;
  aliasAnimal: string | null;
}

type MessageRow = typeof schema.groupMessages.$inferSelect;

@Injectable()
export class GroupsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
    // Pairwise block checks are done in batch via `blockedAmong`; the service is kept for parity with DmService.
    @Inject(BlocksService) readonly blocks: BlocksService,
    @Inject(AliasService) private readonly aliases: AliasService,
  ) {}

  private notFoundGroup() {
    return ApiErrors.notFound("Grupo no encontrado.");
  }

  /** 404 for both "no such group" and "not a member", so group ids can't be probed. */
  private async assertMember(groupId: string, userId: string, exec: Executor = this.db): Promise<typeof schema.groupMembers.$inferSelect> {
    const [row] = await exec
      .select()
      .from(schema.groupMembers)
      .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId)));
    if (!row) throw this.notFoundGroup();
    return row;
  }

  private async memberIdsOf(groupId: string, exec: Executor = this.db): Promise<string[]> {
    const rows = await exec.select({ userId: schema.groupMembers.userId }).from(schema.groupMembers).where(eq(schema.groupMembers.groupId, groupId));
    return rows.map((r) => r.userId);
  }

  async listGroups(viewerId: string): Promise<GroupConversationDto[]> {
    const rows = await this.db
      .select({ id: schema.groupConversations.id })
      .from(schema.groupMembers)
      .innerJoin(schema.groupConversations, eq(schema.groupConversations.id, schema.groupMembers.groupId))
      .where(eq(schema.groupMembers.userId, viewerId))
      .orderBy(desc(sql`coalesce(${schema.groupConversations.lastMessageAt}, ${schema.groupConversations.createdAt})`))
      .limit(MAX_LIST_ROWS);

    return this.buildDtos(
      rows.map((r) => r.id),
      viewerId,
    );
  }

  async getGroup(groupId: string, viewerId: string): Promise<GroupConversationDto> {
    await this.assertMember(groupId, viewerId);
    return this.buildOne(groupId, viewerId);
  }

  async listContacts(viewerId: string): Promise<GroupContactDto[]> {
    const dc = schema.directConversations;
    const rows = await this.db
      .select({ userA: dc.userA, userB: dc.userB })
      .from(dc)
      .where(or(eq(dc.userA, viewerId), eq(dc.userB, viewerId)))
      .limit(MAX_LIST_ROWS);
    const otherIds = rows.map((r) => (r.userA === viewerId ? r.userB : r.userA));
    if (otherIds.length === 0) return [];

    const blocked = await this.blockedAmong(viewerId, otherIds);
    const privacyRows = await this.db.select().from(schema.userPrivacySettings).where(inArray(schema.userPrivacySettings.userId, otherIds));
    const dmDisabled = new Set(privacyRows.filter((p) => !p.allowDirectMessages).map((p) => p.userId));

    const ids = otherIds.filter((id) => !blocked.has(id) && !dmDisabled.has(id));
    if (ids.length === 0) return [];

    const identities = await this.identities(ids);
    return ids
      .map((userId) => {
        const identity = identities.get(userId)!;
        return { userId, displayName: identity.displayName, avatarUrl: identity.avatarUrl, aliasAnimal: identity.aliasAnimal };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
  }

  async createGroup(ownerId: string, input: CreateGroupInput): Promise<{ group: GroupConversationDto; memberIds: string[] }> {
    await this.restrictions.assertNot(ownerId, ["SUSPENDED", "BANNED"]);
    if (input.memberIds.includes(ownerId)) throw ApiErrors.validation("No podés agregarte a vos mismo.");

    const groupId = await this.db.transaction(async (tx) => {
      await this.validateTargets(ownerId, input.memberIds, tx);

      const [group] = await tx
        .insert(schema.groupConversations)
        .values({ name: input.name.trim(), createdBy: ownerId })
        .returning({ id: schema.groupConversations.id });
      if (!group) throw new Error("Failed to insert group");

      await tx.insert(schema.groupMembers).values([
        { groupId: group.id, userId: ownerId, role: "OWNER" as const },
        ...input.memberIds.map((userId) => ({ groupId: group.id, userId, role: "MEMBER" as const })),
      ]);
      return group.id;
    });

    return { group: await this.buildOne(groupId, ownerId), memberIds: [ownerId, ...input.memberIds] };
  }

  async addMembers(groupId: string, requesterId: string, userIds: string[]): Promise<{ group: GroupConversationDto; memberIds: string[] }> {
    const membership = await this.assertMember(groupId, requesterId);
    if (membership.role !== "OWNER") throw ApiErrors.forbidden("Solo quien creó el grupo puede agregar personas.");
    await this.restrictions.assertNot(requesterId, ["SUSPENDED", "BANNED"]);

    const memberIds = await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: schema.groupConversations.id })
        .from(schema.groupConversations)
        .where(eq(schema.groupConversations.id, groupId))
        .for("update");
      if (!locked) throw this.notFoundGroup();

      const current = await this.memberIdsOf(groupId, tx);
      const existing = new Set(current);
      const fresh = userIds.filter((id) => !existing.has(id));
      if (fresh.length === 0) return current;

      if (current.length + fresh.length > GROUP_MAX_MEMBERS) {
        throw ApiErrors.validation(`Un grupo puede tener hasta ${GROUP_MAX_MEMBERS} personas.`);
      }
      await this.validateTargets(requesterId, fresh, tx);

      await tx.insert(schema.groupMembers).values(fresh.map((userId) => ({ groupId, userId, role: "MEMBER" as const })));
      return [...current, ...fresh];
    });

    return { group: await this.buildOne(groupId, requesterId), memberIds };
  }

  async leaveGroup(groupId: string, userId: string): Promise<{ remainingMemberIds: string[]; deleted: boolean }> {
    return this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: schema.groupConversations.id })
        .from(schema.groupConversations)
        .where(eq(schema.groupConversations.id, groupId))
        .for("update");
      if (!locked) throw this.notFoundGroup();

      const [left] = await tx
        .delete(schema.groupMembers)
        .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId)))
        .returning({ role: schema.groupMembers.role });
      if (!left) throw this.notFoundGroup();

      const remaining = await tx
        .select({ userId: schema.groupMembers.userId })
        .from(schema.groupMembers)
        .where(eq(schema.groupMembers.groupId, groupId))
        .orderBy(asc(schema.groupMembers.joinedAt), asc(schema.groupMembers.userId));

      if (remaining.length === 0) {
        await tx.delete(schema.groupConversations).where(eq(schema.groupConversations.id, groupId));
        return { remainingMemberIds: [], deleted: true };
      }

      if (left.role === "OWNER") {
        await tx
          .update(schema.groupMembers)
          .set({ role: "OWNER" })
          .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, remaining[0]!.userId)));
      }
      return { remainingMemberIds: remaining.map((r) => r.userId), deleted: false };
    });
  }

  async listMessages(groupId: string, viewerId: string, cursor?: string | null): Promise<Page<GroupMessageDto>> {
    await this.assertMember(groupId, viewerId);

    const conditions = [eq(schema.groupMessages.groupId, groupId)];
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) conditions.push(lt(schema.groupMessages.createdAt, cursorDate));
    }

    const rows = await this.db
      .select()
      .from(schema.groupMessages)
      .where(and(...conditions))
      .orderBy(desc(schema.groupMessages.createdAt))
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE);
    const nextCursor = rows.length > PAGE_SIZE ? page[page.length - 1]!.createdAt.toISOString() : null;

    const identities = await this.identities([...new Set(page.map((r) => r.senderId))]);
    return { items: page.map((row) => toMessageDto(row, identities.get(row.senderId))), nextCursor };
  }

  async sendMessage(groupId: string, senderId: string, content: string): Promise<{ message: GroupMessageDto; memberIds: string[] }> {
    await this.assertMember(groupId, senderId);
    await this.restrictions.assertNot(senderId, ["MUTE_CHAT", "SUSPENDED", "BANNED"]);

    const { row, memberIds } = await this.db.transaction(async (tx) => {
      const [inserted] = await tx.insert(schema.groupMessages).values({ groupId, senderId, content }).returning();
      if (!inserted) throw new Error("Failed to insert group message");

      await tx.update(schema.groupConversations).set({ lastMessageAt: inserted.createdAt }).where(eq(schema.groupConversations.id, groupId));
      return { row: inserted, memberIds: await this.memberIdsOf(groupId, tx) };
    });

    const identities = await this.identities([senderId]);
    return { message: toMessageDto(row, identities.get(senderId)), memberIds };
  }

  async markRead(groupId: string, userId: string): Promise<void> {
    await this.assertMember(groupId, userId);
    await this.db
      .update(schema.groupMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId)));
  }

  /** Users among `ids` that `viewerId` blocked or that blocked `viewerId`. */
  private async blockedAmong(viewerId: string, ids: string[], exec: Executor = this.db): Promise<Set<string>> {
    const b = schema.userBlocks;
    const rows = await exec
      .select({ blockerId: b.blockerId, blockedId: b.blockedId })
      .from(b)
      .where(or(and(eq(b.blockerId, viewerId), inArray(b.blockedId, ids)), and(inArray(b.blockerId, ids), eq(b.blockedId, viewerId))));
    return new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)));
  }

  /**
   * All-or-nothing check of every target, in order: exists, is a contact, not blocked, accepts DMs.
   * The first failure aborts the request.
   */
  private async validateTargets(requesterId: string, targetIds: string[], exec: Executor): Promise<void> {
    if (targetIds.length === 0) return;

    const users = await exec.select({ id: schema.user.id }).from(schema.user).where(inArray(schema.user.id, targetIds));
    const existing = new Set(users.map((u) => u.id));

    // `direct_conversations` enforces `user_a < user_b`; a contact is any row between the pair.
    const dc = schema.directConversations;
    const contactRows = await exec
      .select({ userA: dc.userA, userB: dc.userB })
      .from(dc)
      .where(or(and(eq(dc.userA, requesterId), inArray(dc.userB, targetIds)), and(eq(dc.userB, requesterId), inArray(dc.userA, targetIds))));
    const contacts = new Set(contactRows.map((r) => (r.userA === requesterId ? r.userB : r.userA)));

    const blocked = await this.blockedAmong(requesterId, targetIds, exec);

    const privacyRows = await exec.select().from(schema.userPrivacySettings).where(inArray(schema.userPrivacySettings.userId, targetIds));
    const dmDisabled = new Set(privacyRows.filter((p) => !p.allowDirectMessages).map((p) => p.userId));

    for (const id of targetIds) {
      if (!existing.has(id)) throw ApiErrors.notFound("Usuario no encontrado.");
      if (!contacts.has(id)) throw ApiErrors.validation("Solo podés agregar personas con las que ya tenés un chat privado.");
      if (blocked.has(id)) throw ApiErrors.blocked();
      if (dmDisabled.has(id)) throw ApiErrors.dmNotAllowed();
    }
  }

  /** Display identity of each user, with aliases backfilled once for the whole batch. */
  private async identities(userIds: string[]): Promise<Map<string, Identity>> {
    const result = new Map<string, Identity>();
    if (userIds.length === 0) return result;

    const users = await this.db.select().from(schema.user).where(inArray(schema.user.id, userIds));
    const profiles = await this.db.select().from(schema.userProfiles).where(inArray(schema.userProfiles.userId, userIds));
    const privacies = await this.db.select().from(schema.userPrivacySettings).where(inArray(schema.userPrivacySettings.userId, userIds));

    const aliasMap = await this.aliases.ensureAliasesForProfiles(profiles);
    const profileById = new Map(profiles.map((p) => [p.userId, { ...p, alias: aliasMap.get(p.userId) ?? p.alias }]));
    const privacyById = new Map(privacies.map((p) => [p.userId, p]));
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    for (const userId of userIds) {
      const profile = profileById.get(userId) ?? null;
      const privacy = privacyById.get(userId) ?? null;
      result.set(userId, {
        displayName: displayName(profile, privacy, nameById.get(userId) ?? "Usuario"),
        avatarUrl: visibleAvatarUrl(profile, privacy),
        aliasAnimal: shownAliasAnimal(profile),
      });
    }
    return result;
  }

  private async buildOne(groupId: string, viewerId: string): Promise<GroupConversationDto> {
    const [dto] = await this.buildDtos([groupId], viewerId);
    if (!dto) throw this.notFoundGroup();
    return dto;
  }

  /** Builds DTOs for the viewer's groups in a constant number of queries, keeping the order of `groupIds`. */
  private async buildDtos(groupIds: string[], viewerId: string): Promise<GroupConversationDto[]> {
    if (groupIds.length === 0) return [];

    const groups = await this.db.select().from(schema.groupConversations).where(inArray(schema.groupConversations.id, groupIds));
    const memberRows = await this.db
      .select()
      .from(schema.groupMembers)
      .where(inArray(schema.groupMembers.groupId, groupIds))
      .orderBy(asc(schema.groupMembers.joinedAt), asc(schema.groupMembers.userId));

    const lastRows = await this.db
      .selectDistinctOn([schema.groupMessages.groupId])
      .from(schema.groupMessages)
      .where(inArray(schema.groupMessages.groupId, groupIds))
      .orderBy(schema.groupMessages.groupId, desc(schema.groupMessages.createdAt));

    const unreadRows = await this.db
      .select({ groupId: schema.groupMessages.groupId, count: count() })
      .from(schema.groupMessages)
      .innerJoin(schema.groupMembers, and(eq(schema.groupMembers.groupId, schema.groupMessages.groupId), eq(schema.groupMembers.userId, viewerId)))
      .where(
        and(
          inArray(schema.groupMessages.groupId, groupIds),
          ne(schema.groupMessages.senderId, viewerId),
          gt(schema.groupMessages.createdAt, sql`coalesce(${schema.groupMembers.lastReadAt}, ${schema.groupMembers.joinedAt})`),
        ),
      )
      .groupBy(schema.groupMessages.groupId);

    const identityIds = [...new Set([...memberRows.map((m) => m.userId), ...lastRows.map((m) => m.senderId)])];
    const identities = await this.identities(identityIds);

    const groupById = new Map(groups.map((g) => [g.id, g]));
    const lastByGroup = new Map(lastRows.map((m) => [m.groupId, m]));
    const unreadByGroup = new Map(unreadRows.map((r) => [r.groupId, Number(r.count)]));

    const result: GroupConversationDto[] = [];
    for (const groupId of groupIds) {
      const group = groupById.get(groupId);
      if (!group) continue;

      const members: GroupMemberDto[] = memberRows
        .filter((m) => m.groupId === groupId)
        .map((m) => {
          const identity = identities.get(m.userId);
          return {
            userId: m.userId,
            displayName: identity?.displayName ?? "Usuario",
            avatarUrl: identity?.avatarUrl ?? null,
            aliasAnimal: identity?.aliasAnimal ?? null,
            role: m.role as GroupRole,
          };
        });
      // Stable sort: the query already ordered by joinedAt, userId.
      members.sort((a, b) => Number(b.role === "OWNER") - Number(a.role === "OWNER"));

      const me = members.find((m) => m.userId === viewerId);
      if (!me) continue;

      const last = lastByGroup.get(groupId);
      const deleted = last ? last.deletedAt !== null : false;
      result.push({
        id: group.id,
        name: group.name,
        members,
        lastMessage: last
          ? {
              senderId: last.senderId,
              senderName: identities.get(last.senderId)?.displayName ?? "Usuario",
              content: deleted ? null : last.content,
              deleted,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
        unread: unreadByGroup.get(groupId) ?? 0,
        lastMessageAt: group.lastMessageAt ? group.lastMessageAt.toISOString() : null,
        createdAt: group.createdAt.toISOString(),
        myRole: me.role,
      });
    }
    return result;
  }
}

function toMessageDto(row: MessageRow, identity: Identity | undefined): GroupMessageDto {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    groupId: row.groupId,
    senderId: row.senderId,
    senderName: identity?.displayName ?? "Usuario",
    senderAvatarUrl: identity?.avatarUrl ?? null,
    senderAliasAnimal: identity?.aliasAnimal ?? null,
    content: deleted ? null : row.content,
    deleted,
    createdAt: row.createdAt.toISOString(),
  };
}
