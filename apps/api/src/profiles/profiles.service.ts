import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { CheckInDto, MyProfileDto, PrivacySettingsDto, PublicProfileDto, updateProfileSchema, updatePrivacySchema } from "@uns/contracts";
import type { z } from "zod";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { displayName, needsAlias, visibleAvatarUrl } from "../users/display-name.js";
import { AliasService } from "../users/alias.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { StudyService } from "../study/study.service.js";
import { toDto as toCheckInDto } from "../checkins/checkins.service.js";

type ProfileRow = typeof schema.userProfiles.$inferSelect;
type PrivacyRow = typeof schema.userPrivacySettings.$inferSelect;
type ProfilePatch = z.infer<typeof updateProfileSchema>;
type PrivacyPatch = z.infer<typeof updatePrivacySchema>;

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StudyService) private readonly study: StudyService,
    @Inject(AliasService) private readonly aliases: AliasService,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
  ) {}

  /** Rows are created lazily on first read/write — there's no signup-time profile step. Also
   *  backfills a missing alias whenever `displayName` would currently need one (HIDDEN by default
   *  for brand-new rows, or old rows never touched since the alias feature shipped). */
  private async ensureProfile(userId: string): Promise<ProfileRow> {
    await this.db.insert(schema.userProfiles).values({ userId }).onConflictDoNothing();
    const [row] = await this.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId)).limit(1);
    if (!row) throw new Error("user_profiles row missing after upsert");
    if (!row.alias && needsAlias(row)) {
      row.alias = await this.aliases.ensureAlias(userId);
    }
    return row;
  }

  private async ensurePrivacy(userId: string): Promise<PrivacyRow> {
    await this.db.insert(schema.userPrivacySettings).values({ userId }).onConflictDoNothing();
    const [row] = await this.db.select().from(schema.userPrivacySettings).where(eq(schema.userPrivacySettings.userId, userId)).limit(1);
    if (!row) throw new Error("user_privacy_settings row missing after upsert");
    return row;
  }

  async getMyProfile(userId: string, email: string): Promise<MyProfileDto> {
    return toMyProfileDto(await this.ensureProfile(userId), email);
  }

  async updateMyProfile(userId: string, email: string, patch: ProfilePatch): Promise<MyProfileDto> {
    await this.restrictions.assertNot(userId, ["SUSPENDED", "BANNED"]);
    await this.ensureProfile(userId);
    const [row] = await this.db
      .update(schema.userProfiles)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.userProfiles.userId, userId))
      .returning();
    if (!row) throw new Error("user_profiles row vanished during update");

    // The saved fields may have just made a HIDDEN->visible (or vice versa) switch take effect:
    // release the alias once it's no longer needed, or assign one now that it is.
    if (needsAlias(row) && !row.alias) {
      row.alias = await this.aliases.ensureAlias(userId);
    } else if (!needsAlias(row) && row.alias) {
      await this.aliases.releaseAlias(userId);
      row.alias = null;
    }
    return toMyProfileDto(row, email);
  }

  /** Generates a fresh random alias, releasing the previous one. Only allowed while HIDDEN — a
   *  visible identity doesn't have (or need) one. Rate-limited by the controller. */
  async rerollAlias(userId: string): Promise<string> {
    const profile = await this.ensureProfile(userId);
    if (profile.identityMode !== "HIDDEN") throw ApiErrors.validation("Sólo podés cambiar tu apodo mientras tu identidad está oculta.");
    return this.aliases.reroll(userId);
  }

  async getMyPrivacy(userId: string): Promise<PrivacySettingsDto> {
    return toPrivacyDto(await this.ensurePrivacy(userId));
  }

  async updateMyPrivacy(userId: string, patch: PrivacyPatch): Promise<PrivacySettingsDto> {
    await this.ensurePrivacy(userId);
    const [row] = await this.db
      .update(schema.userPrivacySettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.userPrivacySettings.userId, userId))
      .returning();
    if (!row) throw new Error("user_privacy_settings row vanished during update");
    return toPrivacyDto(row);
  }

  /** 404s (not 403) when the target has blocked the viewer, so blocking is undetectable from outside. */
  async getPublicProfile(viewerId: string, targetUserId: string): Promise<PublicProfileDto> {
    const [blockedByTarget] = await this.db
      .select({ blockerId: schema.userBlocks.blockerId })
      .from(schema.userBlocks)
      .where(and(eq(schema.userBlocks.blockerId, targetUserId), eq(schema.userBlocks.blockedId, viewerId)))
      .limit(1);
    if (blockedByTarget) throw ApiErrors.notFound();

    const [targetUser] = await this.db.select().from(schema.user).where(eq(schema.user.id, targetUserId)).limit(1);
    if (!targetUser) throw ApiErrors.notFound();

    const [profile] = await this.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, targetUserId)).limit(1);
    const [privacy] = await this.db.select().from(schema.userPrivacySettings).where(eq(schema.userPrivacySettings.userId, targetUserId)).limit(1);
    const [blockedByMe] = await this.db
      .select({ blockerId: schema.userBlocks.blockerId })
      .from(schema.userBlocks)
      .where(and(eq(schema.userBlocks.blockerId, viewerId), eq(schema.userBlocks.blockedId, targetUserId)))
      .limit(1);

    const identityMode = profile?.identityMode ?? "HIDDEN";
    // Ensures a HIDDEN profile without one yet gets an alias, so the public profile never falls
    // back to the bare "Usuario anónimo" once an alias exists.
    const aliasedProfile = await this.aliases.withAlias(profile ?? null);
    const name = displayName(
      profile
        ? { firstName: profile.firstName, lastName: profile.lastName, nickname: profile.nickname, identityMode, alias: aliasedProfile?.alias ?? profile.alias }
        : null,
      null,
      targetUser.name,
    );

    return {
      userId: targetUserId,
      displayName: name,
      // `bio` has no dedicated privacy flag — it rides along with the chosen identity mode: fully
      // hidden profiles (the default) never leak it.
      avatarUrl: identityMode !== "HIDDEN" ? visibleAvatarUrl(profile ?? null, privacy ?? null) : null,
      career: identityMode !== "HIDDEN" && privacy?.showCareer ? (profile?.career ?? null) : null,
      currentSubject: identityMode !== "HIDDEN" && privacy?.showCurrentSubject ? (profile?.currentSubject ?? null) : null,
      bio: identityMode !== "HIDDEN" ? (profile?.bio ?? null) : null,
      instagram: identityMode !== "HIDDEN" && privacy?.showInstagram ? (profile?.instagram ?? null) : null,
      studentNumber: identityMode !== "HIDDEN" && privacy?.showStudentNumber ? (profile?.studentNumber ?? null) : null,
      studyStatus: profile && !needsAlias(profile) ? await this.study.getActiveStatusForUser(targetUserId) : null,
      allowsDirectMessages: privacy?.allowDirectMessages ?? true,
      blockedByMe: Boolean(blockedByMe),
    };
  }

  /** Toggles "Mostrar mi identidad" on the caller's active check-in without re-checking-in. */
  async updateCheckInIdentity(userId: string, showIdentity: boolean): Promise<CheckInDto> {
    const [row] = await this.db
      .update(schema.checkIns)
      .set({ showIdentity, updatedAt: new Date() })
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.status, "ACTIVE")))
      .returning();
    if (!row) throw ApiErrors.noActiveCheckIn();

    const [seat] = await this.db.select({ code: schema.seats.code }).from(schema.seats).where(eq(schema.seats.id, row.seatId)).limit(1);
    return toCheckInDto(row, seat?.code ?? "");
  }

  /** Checks the user out, records an audit trail without PII, then deletes the `user` row (cascades). */
  async deleteAccount(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.moderationActions).values({ actorId: userId, targetUserId: userId, action: "ACCOUNT_DELETED", metadata: {} });
      await tx.delete(schema.user).where(eq(schema.user.id, userId));
    });
  }
}

function toMyProfileDto(row: ProfileRow, email: string): MyProfileDto {
  return {
    userId: row.userId,
    email,
    firstName: row.firstName,
    lastName: row.lastName,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    career: row.career,
    currentSubject: row.currentSubject,
    bio: row.bio,
    instagram: row.instagram,
    studentNumber: row.studentNumber,
    identityMode: row.identityMode,
    alias: row.alias,
  };
}

function toPrivacyDto(row: PrivacyRow): PrivacySettingsDto {
  return {
    showFullName: row.showFullName,
    showNickname: row.showNickname,
    showCareer: row.showCareer,
    showCurrentSubject: row.showCurrentSubject,
    showInstagram: row.showInstagram,
    showStudentNumber: row.showStudentNumber,
    showAvatar: row.showAvatar,
    showInRoom: row.showInRoom,
    showSeat: row.showSeat,
    allowDirectMessages: row.allowDirectMessages,
    showInRanking: row.showInRanking,
    showAliasAnimalOnMap: row.showAliasAnimalOnMap,
  };
}
