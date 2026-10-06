import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { animalIdFromAlias, type RoomPersonDto, type SeatMarkedByDto, type SeatOccupancyDto } from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { displayName, needsAlias, showsAdminBadge, visibleAvatarUrl, type DisplayNameProfile } from "../users/display-name.js";
import { AliasService } from "../users/alias.service.js";
import { RolesService } from "../users/roles.service.js";
import { toStudyStatusDto } from "./study.service.js";

function profileForDisplay(profile: typeof schema.userProfiles.$inferSelect | null, alias?: string | null): DisplayNameProfile | null {
  if (!profile) return null;
  return { firstName: profile.firstName, lastName: profile.lastName, nickname: profile.nickname, customName: profile.customName, identityMode: profile.identityMode, alias: alias ?? profile.alias };
}

/** Read models for "who's in the room" — the `/rooms/:id/people` and `/rooms/:id/occupants` endpoints. */
@Injectable()
export class RoomPeopleService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AliasService) private readonly aliases: AliasService,
    @Inject(RolesService) private readonly roles: RolesService,
  ) {}

  /**
   * Who is in `roomId`, block-excluded both ways. The profile's identity mode alone decides how each person
   * appears: a visible mode (name field filled) shows that name with their profile; a hidden one shows the alias
   * animal only (`userId: null`, no profile fields) — mirroring `listOccupants` — and is left out when
   * `show_alias_animal_on_map` is off.
   */
  async listPeople(roomId: string, viewerId: string): Promise<RoomPersonDto[]> {
    const [blockedByMe, blockedMe] = await Promise.all([
      this.db.select({ id: schema.userBlocks.blockedId }).from(schema.userBlocks).where(eq(schema.userBlocks.blockerId, viewerId)),
      this.db.select({ id: schema.userBlocks.blockerId }).from(schema.userBlocks).where(eq(schema.userBlocks.blockedId, viewerId)),
    ]);
    const excludedIds = [...new Set([...blockedByMe.map((r) => r.id), ...blockedMe.map((r) => r.id)])];

    // Drive from the (small) sets of active check-ins and active study statuses in this room.
    const [checkedIn, studying] = await Promise.all([
      this.db
        .select({ id: schema.checkIns.userId })
        .from(schema.checkIns)
        .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE"))),
      this.db
        .select({ id: schema.studyStatus.userId })
        .from(schema.studyStatus)
        .where(and(eq(schema.studyStatus.roomId, roomId), eq(schema.studyStatus.active, true))),
    ]);
    const excluded = new Set(excludedIds);
    const candidateIds = [...new Set([...checkedIn, ...studying].map((r) => r.id))].filter((id) => !excluded.has(id));
    if (candidateIds.length === 0) return [];

    const rows = await this.db
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
        ),
      )
      .leftJoin(schema.seats, eq(schema.seats.id, schema.checkIns.seatId))
      .leftJoin(
        schema.studyStatus,
        and(
          eq(schema.studyStatus.userId, schema.user.id),
          eq(schema.studyStatus.roomId, roomId),
          eq(schema.studyStatus.active, true),
        ),
      )
      .where(
        and(
          inArray(schema.user.id, candidateIds),
          or(eq(schema.checkIns.status, "ACTIVE"), eq(schema.studyStatus.active, true)),
        ),
      );

    // A visible identity mode (with its field filled) is always listed by that name; the alias is only for hidden users.
    const hasVisibleName = (r: (typeof rows)[number]) => Boolean(r.profile) && !needsAlias(r.profile!);
    const admins = await this.roles.adminIds(rows.filter(hasVisibleName).map((r) => r.userId));

    const result: RoomPersonDto[] = [];
    for (const r of rows) {
      if (hasVisibleName(r)) {
        result.push({
          userId: r.userId,
          displayName: displayName(profileForDisplay(r.profile), null, r.userName),
          avatarUrl: visibleAvatarUrl(r.profile ?? null, r.privacy ?? null),
          career: r.privacy?.showCareer ? (r.profile?.career ?? null) : null,
          seatCode: r.seatCode ?? null,
          studyStatus: r.study ? toStudyStatusDto(r.study) : null,
          adminBadge: showsAdminBadge(admins.has(r.userId), r.profile, r.privacy),
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

  /**
   * One entry per active check-in (`SeatOccupantDto`) plus one per seat that is OCCUPIED only because
   * someone marked it (`SeatMarkedByDto`). Identity follows the profile's identity mode alone:
   * visible -> real display name, photo (if `show_avatar`) or silhouette, `userId` set; otherwise
   * alias + animal (if `show_alias_animal_on_map`) or "Alguien" + silhouette, and `userId` is always
   * `null` so a hidden user can never be linked to their seat.
   */
  async listOccupants(roomId: string): Promise<SeatOccupancyDto[]> {
    const rows = await this.db
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
      .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE")));

    const admins = await this.roles.adminIds(rows.filter((r) => r.profile && !needsAlias(r.profile)).map((r) => r.userId));
    const result: SeatOccupancyDto[] = [];
    for (const r of rows) {
      if (r.profile && !needsAlias(r.profile)) {
        const url = visibleAvatarUrl(r.profile ?? null, r.privacy ?? null);
        result.push({
          seatId: r.seatId,
          userId: r.userId,
          displayName: displayName(profileForDisplay(r.profile), null, r.userName),
          avatarUrl: url,
          avatar: url ? { kind: "photo", url } : { kind: "silhouette" },
          adminBadge: showsAdminBadge(admins.has(r.userId), r.profile, r.privacy),
        });
        continue;
      }

      // Hidden on the map: never expose the userId, and only the alias animal (if allowed) identifies them.
      const showAnimal = r.privacy?.showAliasAnimalOnMap ?? true;
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
    result.push(...(await this.listMarkedBy(roomId, checkedInSeats)));
    return result;
  }

  /** Seats whose freshest live observation says OCCUPIED or SAVED and that have nobody checked in. */
  private async listMarkedBy(roomId: string, checkedInSeats: Set<string>): Promise<SeatMarkedByDto[]> {
    const observations = await this.db
      .select({
        seatId: schema.seatObservations.seatId,
        status: schema.seatObservations.observedStatus,
        observedAt: schema.seatObservations.observedAt,
        userId: schema.seatObservations.userId,
        adminOverride: schema.seatObservations.adminOverride,
        userName: schema.user.name,
        profile: schema.userProfiles,
      })
      .from(schema.seatObservations)
      .innerJoin(schema.user, eq(schema.user.id, schema.seatObservations.userId))
      .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.seatObservations.userId))
      .where(and(eq(schema.seatObservations.roomId, roomId), gt(schema.seatObservations.expiresAt, new Date())))
      .orderBy(desc(schema.seatObservations.observedAt));

    const latestBySeat = new Map<string, (typeof observations)[number]>();
    for (const o of observations) if (!latestBySeat.has(o.seatId)) latestBySeat.set(o.seatId, o);
    const marked = [...latestBySeat.values()].filter((o) => (o.status === "OCCUPIED" || o.status === "SAVED") && !checkedInSeats.has(o.seatId));
    if (marked.length === 0) return [];

    const aliasByUser = await this.aliases.ensureAliasesForProfiles(marked.flatMap((o) => (o.profile ? [o.profile] : [])));
    return marked.map((o) => ({
      seatId: o.seatId,
      kind: o.status === "SAVED" ? "SAVED" : "OCCUPIED",
      markedBy: {
        // An admin bulk-mark never exposes which admin did it.
        displayName: o.adminOverride ? "Administración" : displayName(profileForDisplay(o.profile, aliasByUser.get(o.userId)), null, o.userName),
        observedAt: o.observedAt.toISOString(),
      },
    }));
  }
}
