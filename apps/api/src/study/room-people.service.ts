import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, or } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { RoomPersonDto, SeatOccupantDto } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { displayName, visibleAvatarUrl, type DisplayNameProfile } from "../users/display-name.js";
import { AliasService } from "../users/alias.service.js";
import { toStudyStatusDto } from "./study.service.js";

function profileForDisplay(profile: typeof schema.userProfiles.$inferSelect | null, alias?: string | null): DisplayNameProfile | null {
  if (!profile) return null;
  return { firstName: profile.firstName, lastName: profile.lastName, nickname: profile.nickname, identityMode: profile.identityMode, alias: alias ?? profile.alias };
}

/** Read models for "who's in the room" — the `/rooms/:id/people` and `/rooms/:id/occupants` endpoints. */
@Injectable()
export class RoomPeopleService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AliasService) private readonly aliases: AliasService,
  ) {}

  /** Registered users visible in `roomId`: `show_in_room` + (active check-in or active study status), block-excluded both ways. */
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
        userId: schema.userPrivacySettings.userId,
        userName: schema.user.name,
        profile: schema.userProfiles,
        privacy: schema.userPrivacySettings,
        checkIn: schema.checkIns,
        seatCode: schema.seats.code,
        study: schema.studyStatus,
      })
      .from(schema.userPrivacySettings)
      .innerJoin(schema.user, eq(schema.user.id, schema.userPrivacySettings.userId))
      .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.userPrivacySettings.userId))
      .leftJoin(
        schema.checkIns,
        and(
          eq(schema.checkIns.userId, schema.userPrivacySettings.userId),
          eq(schema.checkIns.roomId, roomId),
          eq(schema.checkIns.status, "ACTIVE"),
        ),
      )
      .leftJoin(schema.seats, eq(schema.seats.id, schema.checkIns.seatId))
      .leftJoin(
        schema.studyStatus,
        and(
          eq(schema.studyStatus.userId, schema.userPrivacySettings.userId),
          eq(schema.studyStatus.roomId, roomId),
          eq(schema.studyStatus.active, true),
        ),
      )
      .where(
        and(
          inArray(schema.userPrivacySettings.userId, candidateIds),
          eq(schema.userPrivacySettings.showInRoom, true),
          or(eq(schema.checkIns.status, "ACTIVE"), eq(schema.studyStatus.active, true)),
        ),
      );

    const aliasByUser = await this.aliases.ensureAliasesForProfiles(rows.flatMap((r) => (r.profile ? [r.profile] : [])));

    return rows.map((r) => ({
      userId: r.userId,
      displayName: displayName(profileForDisplay(r.profile, aliasByUser.get(r.userId)), null, r.userName),
      avatarUrl: visibleAvatarUrl(r.profile ?? null, r.privacy),
      career: r.privacy.showCareer ? (r.profile?.career ?? null) : null,
      seatCode: r.checkIn?.showIdentity && r.privacy.showSeat ? (r.seatCode ?? null) : null,
      studyStatus: r.study ? toStudyStatusDto(r.study) : null,
    }));
  }

  /** Seats whose occupant chose to be identified: active check-in with `show_identity` + `show_seat`. */
  async listOccupants(roomId: string): Promise<SeatOccupantDto[]> {
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
      .innerJoin(schema.userPrivacySettings, eq(schema.userPrivacySettings.userId, schema.checkIns.userId))
      .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.checkIns.userId))
      .where(
        and(
          eq(schema.checkIns.roomId, roomId),
          eq(schema.checkIns.status, "ACTIVE"),
          eq(schema.checkIns.showIdentity, true),
          eq(schema.userPrivacySettings.showSeat, true),
        ),
      );

    const aliasByUser = await this.aliases.ensureAliasesForProfiles(rows.flatMap((r) => (r.profile ? [r.profile] : [])));

    return rows.map((r) => ({
      seatId: r.seatId,
      userId: r.userId,
      displayName: displayName(profileForDisplay(r.profile, aliasByUser.get(r.userId)), null, r.userName),
      avatarUrl: visibleAvatarUrl(r.profile ?? null, r.privacy),
    }));
  }
}
