import { and, desc, eq, gt, gte, inArray, or } from "drizzle-orm";
import { inChunks, schema, type Db } from "@sala/database";
import { animalIdFromAlias, type ProfileFlairDto, type RoomPersonDto, type SeatMarkedByDto, type SeatOccupancyDto } from "@sala/contracts";
import { displayName, needsAlias, showsAdminBadge, visibleAvatarUrl, type DisplayNameProfile } from "../users/display-name.js";
import type { AliasService } from "../users/alias.service.js";
import type { RolesService } from "../users/roles.service.js";
import type { ProService } from "../subscriptions/pro.js";
import type { UserCosmeticsService } from "../cosmetics/cosmetics.service.js";
import { toStudyStatusDto } from "./study.service.js";
import type { RoomHours } from "../rooms/room-hours.js";

function profileForDisplay(profile: typeof schema.userProfiles.$inferSelect | null, alias?: string | null): DisplayNameProfile | null {
  if (!profile) return null;
  return { firstName: profile.firstName, lastName: profile.lastName, nickname: profile.nickname, customName: profile.customName, identityMode: profile.identityMode, alias: alias ?? profile.alias };
}

/** Read models for "who's in the room" — the `/rooms/:id/people` and `/rooms/:id/occupants` endpoints. */
export class RoomPeopleService {
  constructor(
    private readonly db: Db,
    private readonly aliases: AliasService,
    private readonly roles: RolesService,
    /** Pro badge and flair lookups; null in tests that construct the service directly. */
    private readonly pro: ProService | null = null,
    private readonly cosmetics: UserCosmeticsService | null = null,
    private readonly hours: RoomHours | null = null,
  ) {}

  /**
   * Who is in `roomId`, block-excluded both ways. The profile's identity mode alone decides how each person
   * appears: a visible mode (name field filled) shows that name with their profile; a hidden one shows the alias
   * animal only (`userId: null`, no profile fields) — mirroring `listOccupants` — and is left out when
   * `show_alias_animal_on_map` is off.
   */
  async listPeople(roomId: string, viewerId: string): Promise<RoomPersonDto[]> {
    const window = this.hours?.window(roomId);
    if (window?.open === false) return [];
    const now = new Date();
    const excluded = await this.blockedEitherWay(viewerId);

    // Drive from the (small) sets of active check-ins and active study statuses in this room.
    const checkedIn = this.db
      .select({ id: schema.checkIns.userId })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE"), gt(schema.checkIns.expiresAt, now), window ? gte(schema.checkIns.startedAt, window.opensAt) : undefined))
      .all();
    const studying = this.db
      .select({ id: schema.studyStatus.userId })
      .from(schema.studyStatus)
      .where(and(eq(schema.studyStatus.roomId, roomId), eq(schema.studyStatus.active, true), window ? gte(schema.studyStatus.updatedAt, window.opensAt) : undefined))
      .all();
    const candidateIds = [...new Set([...checkedIn, ...studying].map((r) => r.id))].filter((id) => !excluded.has(id));
    if (candidateIds.length === 0) return [];

    // About 7 bound params besides the id list, so chunk well under the 100-param limit.
    const rows = inChunks(
      candidateIds,
      (part) =>
        this.db
      .select({
        userId: schema.user.id,
        userName: schema.user.name,
        profile: schema.userProfiles,
        privacy: schema.userPrivacySettings,
        checkIn: schema.checkIns,
        seatCode: schema.seats.code,
        study: schema.studyStatus,
      })
      .from(schema.user)
      .leftJoin(schema.userPrivacySettings, eq(schema.userPrivacySettings.userId, schema.user.id))
      .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.user.id))
      .leftJoin(
        schema.checkIns,
        and(
          eq(schema.checkIns.userId, schema.user.id),
          eq(schema.checkIns.roomId, roomId),
          eq(schema.checkIns.status, "ACTIVE"),
          gt(schema.checkIns.expiresAt, now),
          window ? gte(schema.checkIns.startedAt, window.opensAt) : undefined,
        ),
      )
      .leftJoin(schema.seats, eq(schema.seats.id, schema.checkIns.seatId))
      .leftJoin(
        schema.studyStatus,
        and(
          eq(schema.studyStatus.userId, schema.user.id),
          eq(schema.studyStatus.roomId, roomId),
          eq(schema.studyStatus.active, true),
          window ? gte(schema.studyStatus.updatedAt, window.opensAt) : undefined,
        ),
      )
      .where(
        and(
          inArray(schema.user.id, part),
          or(eq(schema.checkIns.status, "ACTIVE"), eq(schema.studyStatus.active, true)),
        ),
      )
      .all(),
      80,
    );

    // A visible identity mode (with its field filled) is always listed by that name; the alias is only for hidden users.
    const hasVisibleName = (r: (typeof rows)[number]) => Boolean(r.profile) && !needsAlias(r.profile!);
    const visibleIds = rows.filter(hasVisibleName).map((r) => r.userId);
    const admins = await this.roles.adminBadges(visibleIds);
    const { paid, flair } = await this.proFlair(visibleIds);

    const result: RoomPersonDto[] = [];
    for (const r of rows) {
      if (hasVisibleName(r)) {
        result.push({
          ...(paid.has(r.userId) ? { proBadge: true } : {}),
          ...(flair.has(r.userId) ? { flair: flair.get(r.userId) } : {}),
          userId: r.userId,
          displayName: displayName(profileForDisplay(r.profile), null, r.userName),
          avatarUrl: visibleAvatarUrl(r.profile ?? null, r.privacy ?? null),
          career: r.privacy?.showCareer ? (r.profile?.career ?? null) : null,
          seatCode: r.seatCode ?? null,
          studyStatus: r.study ? toStudyStatusDto(r.study) : null,
          adminBadge: showsAdminBadge(admins.get(r.userId) ?? false, r.profile, r.privacy),
        });
        continue;
      }

      // Hidden: only a checked-in user whose alias animal is on the map shows up, as that alias.
      if (!r.checkIn || !r.profile || !(r.privacy?.showAliasAnimalOnMap ?? true)) continue;
      const alias = r.profile.alias && r.profile.aliasAnimal ? r.profile.alias : await this.aliases.ensureAlias(r.userId);
      const animalId = animalIdFromAlias(alias);
      if (!animalId) continue;
      result.push({
        userId: null,
        displayName: alias,
        avatarUrl: null,
        career: null,
        seatCode: r.seatCode ?? null,
        studyStatus: null,
        aliasAnimal: animalId,
      });
    }
    return result;
  }

  /** Paid subset of `visibleIds` (one `badgeIds` call) and their flair. Both empty without the Pro services. */
  private async proFlair(visibleIds: string[]): Promise<{ paid: Set<string>; flair: Map<string, ProfileFlairDto> }> {
    const paid = this.pro && visibleIds.length > 0 ? await this.pro.badgeIds(visibleIds) : new Set<string>();
    const flair = this.cosmetics ? await this.cosmetics.flairFor(paid) : new Map<string, ProfileFlairDto>();
    return { paid, flair };
  }

  /** Users `viewerId` blocked or was blocked by. */
  private async blockedEitherWay(viewerId: string): Promise<Set<string>> {
    const blockedByMe = this.db.select({ id: schema.userBlocks.blockedId }).from(schema.userBlocks).where(eq(schema.userBlocks.blockerId, viewerId)).all();
    const blockedMe = this.db.select({ id: schema.userBlocks.blockerId }).from(schema.userBlocks).where(eq(schema.userBlocks.blockedId, viewerId)).all();
    return new Set([...blockedByMe.map((r) => r.id), ...blockedMe.map((r) => r.id)]);
  }

  /**
   * One entry per active check-in (`SeatOccupantDto`) plus the latest live observation per seat
   * without a check-in (`SeatMarkedByDto`). Identity follows the profile's identity mode alone:
   * visible -> real display name, photo (if `show_avatar`) or silhouette, `userId` set; otherwise
   * alias + animal (if `show_alias_animal_on_map`) or "Alguien" + silhouette, and `userId` is always
   * `null` so a hidden user can never be linked to their seat. Someone blocked either way with `viewerId`
   * always shows as an anonymous "Alguien".
   */
  async listOccupants(roomId: string, viewerId?: string): Promise<SeatOccupancyDto[]> {
    const window = this.hours?.window(roomId);
    if (window?.open === false) return [];
    const now = new Date();
    const blocked = viewerId ? await this.blockedEitherWay(viewerId) : new Set<string>();
    const rows = this.db
      .select({
        seatId: schema.checkIns.seatId,
        userId: schema.checkIns.userId,
        userName: schema.user.name,
        profile: schema.userProfiles,
        privacy: schema.userPrivacySettings,
      })
      .from(schema.checkIns)
      .innerJoin(schema.user, eq(schema.user.id, schema.checkIns.userId))
      .leftJoin(schema.userPrivacySettings, eq(schema.userPrivacySettings.userId, schema.checkIns.userId))
      .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.checkIns.userId))
      .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE"), gt(schema.checkIns.expiresAt, now), window ? gte(schema.checkIns.startedAt, window.opensAt) : undefined))
      .all();

    const isVisible = (r: (typeof rows)[number]) => Boolean(r.profile) && !needsAlias(r.profile!) && !blocked.has(r.userId);
    const visibleIds = rows.filter(isVisible).map((r) => r.userId);
    const admins = await this.roles.adminBadges(visibleIds);
    const { paid, flair } = await this.proFlair(visibleIds);
    const result: SeatOccupancyDto[] = [];
    for (const r of rows) {
      if (isVisible(r)) {
        const url = visibleAvatarUrl(r.profile ?? null, r.privacy ?? null);
        result.push({
          ...(paid.has(r.userId) ? { proBadge: true } : {}),
          ...(flair.has(r.userId) ? { flair: flair.get(r.userId) } : {}),
          seatId: r.seatId,
          userId: r.userId,
          displayName: displayName(profileForDisplay(r.profile), null, r.userName),
          avatarUrl: url,
          avatar: url ? { kind: "photo", url } : { kind: "silhouette" },
          adminBadge: showsAdminBadge(admins.get(r.userId) ?? false, r.profile, r.privacy),
        });
        continue;
      }

      // Hidden on the map: never expose the userId, and only the alias animal (if allowed) identifies them.
      const showAnimal = (r.privacy?.showAliasAnimalOnMap ?? true) && !blocked.has(r.userId);
      let alias: string | null = null;
      if (r.profile && showAnimal) {
        alias = r.profile.alias && r.profile.aliasAnimal ? r.profile.alias : await this.aliases.ensureAlias(r.userId);
      }
      const animalId = animalIdFromAlias(alias);
      result.push({
        seatId: r.seatId,
        userId: null,
        displayName: alias && animalId ? alias : "Alguien",
        avatarUrl: null,
        avatar: alias && animalId ? { kind: "animal", animalId } : { kind: "silhouette" },
      });
    }

    const checkedInSeats = new Set(rows.map((r) => r.seatId));
    result.push(...(await this.listMarkedBy(roomId, checkedInSeats, blocked)));
    return result;
  }

  /** Latest live observation per seat without a check-in; never publishes account IDs or emails. */
  private async listMarkedBy(roomId: string, checkedInSeats: Set<string>, blocked: Set<string>): Promise<SeatMarkedByDto[]> {
    const observations = this.db
      .select({
        seatId: schema.seatObservations.seatId,
        status: schema.seatObservations.observedStatus,
        observedAt: schema.seatObservations.observedAt,
        userId: schema.seatObservations.userId,
        userName: schema.user.name,
        profile: schema.userProfiles,
      })
      .from(schema.seatObservations)
      .innerJoin(schema.user, eq(schema.user.id, schema.seatObservations.userId))
      .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.seatObservations.userId))
      .where(and(eq(schema.seatObservations.roomId, roomId), gt(schema.seatObservations.expiresAt, new Date())))
      .orderBy(desc(schema.seatObservations.observedAt))
      .all();

    const latestBySeat = new Map<string, (typeof observations)[number]>();
    for (const o of observations) if (!latestBySeat.has(o.seatId)) latestBySeat.set(o.seatId, o);
    const marked = [...latestBySeat.values()].filter((o) => !checkedInSeats.has(o.seatId));
    if (marked.length === 0) return [];

    const aliasByUser = await this.aliases.ensureAliasesForProfiles(marked.flatMap((o) => (o.profile ? [o.profile] : [])));
    return marked.map((o) => ({
      seatId: o.seatId,
      kind: o.status,
      markedBy: {
        // Administrative observations follow the same public identity and block rules.
        displayName: blocked.has(o.userId)
            ? "Alguien"
            : displayName(profileForDisplay(o.profile, aliasByUser.get(o.userId)), null, o.userName),
        observedAt: o.observedAt.toISOString(),
      },
    }));
  }
}
