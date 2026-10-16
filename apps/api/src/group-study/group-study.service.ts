import { and, eq, gt, inArray, or } from "drizzle-orm";
import { inChunks, schema, type Db } from "@sala/database";
import { seatLabel, type GroupFocusDto, type GroupPresenceDto, type GroupPresenceMemberDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { isMissingSchemaError, orDefault } from "../common/sqlite-errors.js";
import type { Clock } from "../platform/clock.js";
import type { BlocksService } from "../blocks/blocks.service.js";
import type { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import type { AliasService } from "../users/alias.service.js";
import { displayName, shownAliasAnimal, visibleAvatarUrl } from "../users/display-name.js";

/** Pro group study: who in the group is seated where, and a shared focus timer. */
export class GroupStudyService {
  constructor(
    private readonly db: Db,
    private readonly alias: AliasService,
    // Kept for parity with the other chat services; pairwise checks are done in one batch below.
    readonly blocks: BlocksService,
    private readonly realtime: RoomRealtimeGateway,
    private readonly clock: Clock,
  ) {}

  /** 404 for both "no such group" and "not a member", like GroupsService. Returns every member id. Also used by GroupRankingService. */
  memberIdsOf(groupId: string, userId: string): string[] {
    const rows = this.db.select({ userId: schema.groupMembers.userId }).from(schema.groupMembers).where(eq(schema.groupMembers.groupId, groupId)).all();
    const ids = rows.map((r) => r.userId);
    if (!ids.includes(userId)) throw ApiErrors.notFound("Grupo no encontrado.");
    return ids;
  }

  /** Writes to the new tables turn a missing schema into a clean 503 instead of a 500. */
  private async guardWrite<T>(fn: () => Promise<T> | T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isMissingSchemaError(err)) throw ApiErrors.featureDisabled();
      throw err;
    }
  }

  /** 404 if the user is not a member. */
  async presence(groupId: string, userId: string): Promise<GroupPresenceDto> {
    const memberIds = this.memberIdsOf(groupId, userId);
    const now = this.clock.now();

    const optOutIds = await orDefault(
      () =>
        this.db
          .select({ userId: schema.groupSeatShareOptouts.userId })
          .from(schema.groupSeatShareOptouts)
          .where(eq(schema.groupSeatShareOptouts.groupId, groupId))
          .all()
          .map((r) => r.userId),
      [] as string[],
    );
    const optedOut = new Set(optOutIds);

    const focus = await orDefault(() => this.loadFocus(groupId, now), null);

    // Members who did not opt out, minus anyone blocked in either direction with the requester.
    const blocked = this.blockedAmong(userId, memberIds);
    const candidates = memberIds.filter((id) => !optedOut.has(id) && !blocked.has(id));
    const members = await this.seatedMembers(candidates, now);

    return { members, sharing: !optedOut.has(userId), focus };
  }

  /** 404 if the user is not a member. */
  async setSeatShare(groupId: string, userId: string, share: boolean): Promise<void> {
    const memberIds = this.memberIdsOf(groupId, userId);
    const t = schema.groupSeatShareOptouts;
    const changed = await this.guardWrite(() =>
      this.db.transaction((tx) => {
        const [existing] = tx
          .select({ userId: t.userId })
          .from(t)
          .where(and(eq(t.groupId, groupId), eq(t.userId, userId)))
          .all();
        // Already in the requested state: a write would only burn rows_written.
        if (share ? !existing : Boolean(existing)) return false;
        if (share) tx.delete(t).where(and(eq(t.groupId, groupId), eq(t.userId, userId))).run();
        else tx.insert(t).values({ groupId, userId, createdAt: this.clock.now() }).run();
        return true;
      }),
    );
    if (changed) this.realtime.emitGroupUpdated(memberIds, { groupId });
  }

  async startFocus(groupId: string, userId: string, minutes: number): Promise<GroupFocusDto> {
    const memberIds = this.memberIdsOf(groupId, userId);
    const startedAt = this.clock.now();
    const endsAt = new Date(startedAt.getTime() + minutes * 60_000);
    const t = schema.groupFocusTimers;
    await this.guardWrite(() =>
      this.db
        .insert(t)
        .values({ groupId, startedBy: userId, minutes, startedAt, endsAt })
        .onConflictDoUpdate({ target: t.groupId, set: { startedBy: userId, minutes, startedAt, endsAt } }),
    );
    this.realtime.emitGroupUpdated(memberIds, { groupId });
    return toFocusDto({ startedBy: userId, minutes, startedAt, endsAt });
  }

  async stopFocus(groupId: string, userId: string): Promise<void> {
    const memberIds = this.memberIdsOf(groupId, userId);
    const t = schema.groupFocusTimers;
    const removed = await this.guardWrite(() => this.db.delete(t).where(eq(t.groupId, groupId)).returning({ groupId: t.groupId }).all());
    if (removed.length > 0) this.realtime.emitGroupUpdated(memberIds, { groupId });
  }

  /** The timer row if it has not ended yet; expired rows are left alone (no write). */
  private loadFocus(groupId: string, now: Date): GroupFocusDto | null {
    const t = schema.groupFocusTimers;
    const [row] = this.db
      .select()
      .from(t)
      .where(and(eq(t.groupId, groupId), gt(t.endsAt, now)))
      .all();
    return row ? toFocusDto(row) : null;
  }

  /** Users among `ids` that `viewerId` blocked or that blocked `viewerId`. Also used by GroupRankingService. */
  blockedAmong(viewerId: string, ids: string[]): Set<string> {
    const b = schema.userBlocks;
    // Each id binds twice, so keep parts small enough for the 100-parameter cap.
    const rows = inChunks(
      ids,
      (part) =>
        this.db
          .select({ blockerId: b.blockerId, blockedId: b.blockedId })
          .from(b)
          .where(or(and(eq(b.blockerId, viewerId), inArray(b.blockedId, part)), and(inArray(b.blockerId, part), eq(b.blockedId, viewerId))))
          .all(),
      45,
    );
    return new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)));
  }

  /** Members with a live ACTIVE check-in, joined to room and seat for the labels. */
  private async seatedMembers(userIds: string[], now: Date): Promise<GroupPresenceMemberDto[]> {
    if (userIds.length === 0) return [];
    const c = schema.checkIns;
    const rows = inChunks(userIds, (part) =>
      this.db
        .select({
          userId: c.userId,
          seatId: c.seatId,
          startedAt: c.startedAt,
          expiresAt: c.expiresAt,
          roomSlug: schema.rooms.slug,
          roomName: schema.rooms.name,
          seatNumber: schema.seats.seatNumber,
          tableCode: schema.roomTables.code,
          tableType: schema.roomTables.type,
        })
        .from(c)
        .innerJoin(schema.rooms, eq(schema.rooms.id, c.roomId))
        .innerJoin(schema.seats, eq(schema.seats.id, c.seatId))
        .innerJoin(schema.roomTables, eq(schema.roomTables.id, schema.seats.tableId))
        .where(and(inArray(c.userId, part), eq(c.status, "ACTIVE"), gt(c.expiresAt, now)))
        .all(),
    );
    if (rows.length === 0) return [];

    const seatedIds = rows.map((r) => r.userId);
    const users = inChunks(seatedIds, (part) => this.db.select().from(schema.user).where(inArray(schema.user.id, part)).all());
    const profiles = inChunks(seatedIds, (part) => this.db.select().from(schema.userProfiles).where(inArray(schema.userProfiles.userId, part)).all());
    const privacies = inChunks(seatedIds, (part) =>
      this.db.select().from(schema.userPrivacySettings).where(inArray(schema.userPrivacySettings.userId, part)).all(),
    );
    const aliasMap = await this.alias.ensureAliasesForProfiles(profiles);
    const profileById = new Map(profiles.map((p) => [p.userId, { ...p, alias: aliasMap.get(p.userId) ?? p.alias }]));
    const privacyById = new Map(privacies.map((p) => [p.userId, p]));
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return rows
      .map((r): GroupPresenceMemberDto => {
        const profile = profileById.get(r.userId) ?? null;
        const privacy = privacyById.get(r.userId) ?? null;
        return {
          userId: r.userId,
          displayName: displayName(profile, privacy, nameById.get(r.userId) ?? "Usuario"),
          avatarUrl: visibleAvatarUrl(profile, privacy),
          aliasAnimal: shownAliasAnimal(profile),
          roomSlug: r.roomSlug,
          roomName: r.roomName,
          seatId: r.seatId,
          seatLabel: seatLabel(r.tableCode, r.tableType, r.seatNumber),
          since: r.startedAt.toISOString(),
          expiresAt: r.expiresAt.toISOString(),
        };
      })
      .sort((a, b) => a.since.localeCompare(b.since) || a.userId.localeCompare(b.userId));
  }
}

function toFocusDto(row: { startedBy: string; minutes: number; startedAt: Date; endsAt: Date }): GroupFocusDto {
  return { startedBy: row.startedBy, minutes: row.minutes, startedAt: row.startedAt.toISOString(), endsAt: row.endsAt.toISOString() };
}
