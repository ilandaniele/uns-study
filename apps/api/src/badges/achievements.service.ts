import { and, eq, inArray, or } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { AchievementDto, AchievementsDto, AliasProfileDto, BadgeDto, BadgeId, PublicAchievementsDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { needsAlias } from "../users/display-name.js";
import type { Clock } from "../platform/clock.js";
import type { StreakBadgesService } from "./streak-badges.service.js";
import type { CollaborationService } from "./collaboration.service.js";
import type { GardenService } from "../garden/garden.service.js";
import type { RankingsService } from "../rankings/rankings.service.js";
import type { ProfilesService } from "../profiles/profiles.service.js";
import { achievementPresentation, COLLABORATION_BADGES } from "./achievement-catalog.js";

export class AchievementsService {
  constructor(private readonly db: Db, private readonly clock: Clock, private readonly streak: StreakBadgesService, private readonly collaboration: CollaborationService, private readonly garden: GardenService, private readonly rankings: RankingsService) {}

  async get(userId: string): Promise<AchievementsDto> {
    const { badges: studyBadges, stats } = await this.streak.badgeSummary(userId);
    const collaboration = this.collaboration.progress(userId);
    const rules: BadgeDto[] = [...studyBadges, ...COLLABORATION_BADGES.map(rule => ({
      id: rule.id, title: rule.title, description: `Actualizaste ${rule.target} lugares distintos. Cada lugar cuenta una vez por día.`,
      earned: collaboration.places >= rule.target, progress: Math.min(1, collaboration.places / rule.target),
    }))];
    let stored = this.db.select().from(schema.userAchievements).where(eq(schema.userAchievements.userId, userId)).all();
    const missing = rules.filter(rule => rule.earned && !stored.some(award => award.badgeId === rule.id));
    if (missing.length) {
      this.db.transaction(tx => {
        for (const rule of missing) tx.insert(schema.userAchievements).values({ userId, badgeId: rule.id, earnedAt: this.clock.now() }).onConflictDoNothing().run();
      });
      stored = this.db.select().from(schema.userAchievements).where(eq(schema.userAchievements.userId, userId)).all();
    }
    const awards = new Map(stored.map(award => [award.badgeId, award]));
    const badges: AchievementDto[] = rules.map(rule => {
      const award = awards.get(rule.id);
      const tier = achievementPresentation(rule.id)!.tier;
      return { ...rule, earned: Boolean(award), progress: award ? 1 : rule.progress, tier, earnedAt: award?.earnedAt.toISOString() ?? null };
    });
    return { badges, stats: { studyMinutes: stats.studyMinutes, studyDays: stats.studyDays }, collaboration, rewards: this.collaboration.pendingRewards(userId), unseenIds: stored.filter(award => !award.seenAt && achievementPresentation(award.badgeId)).map(award => award.badgeId as BadgeId) };
  }

  markSeen(userId: string, ids: BadgeId[]): void {
    this.db.update(schema.userAchievements).set({ seenAt: this.clock.now() })
      .where(and(eq(schema.userAchievements.userId, userId), inArray(schema.userAchievements.badgeId, ids))).run();
  }

  private activityVisible(viewerId: string, userId: string): boolean {
    const exists = this.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).get();
    const blocked = this.db.select().from(schema.userBlocks).where(or(
      and(eq(schema.userBlocks.blockerId, viewerId), eq(schema.userBlocks.blockedId, userId)),
      and(eq(schema.userBlocks.blockerId, userId), eq(schema.userBlocks.blockedId, viewerId)),
    )).get();
    if (!exists || blocked) throw ApiErrors.notFound();
    const privacy = this.db.select().from(schema.userPrivacySettings).where(eq(schema.userPrivacySettings.userId, userId)).get();
    return privacy?.showInRanking !== false;
  }

  async publicFor(viewerId: string, userId: string): Promise<PublicAchievementsDto> {
    if (!this.activityVisible(viewerId, userId)) return { badges: [], stats: null };
    const data = await this.get(userId);
    const ranking = await this.rankings.getRankings("principal", "week", "study_time", userId, this.clock.now());
    if (!this.activityVisible(viewerId, userId)) return { badges: [], stats: null };
    return { badges: data.badges.filter(badge => badge.earned), stats: { ...data.stats, places: data.collaboration.places, weekRank: (ranking.me?.rank ?? 0) > 0 ? ranking.me!.rank : null } };
  }

  async aliasProfile(viewerId: string, alias: string): Promise<AliasProfileDto> {
    if (alias.length > 80) throw ApiErrors.notFound();
    const profile = this.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.aliasLower, alias.trim().toLowerCase())).get();
    // A retired/visible alias never redirects to its account: this route cannot deanonymize it.
    if (!profile?.alias || !needsAlias(profile)) throw ApiErrors.notFound();
    const data = await this.publicFor(viewerId, profile.userId);
    const garden = await this.garden.visit(viewerId, profile.userId);
    const current = this.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, profile.userId)).get();
    if (!current || !needsAlias(current) || current.aliasLower !== profile.aliasLower) throw ApiErrors.notFound();
    const visible = this.activityVisible(viewerId, profile.userId);
    const privacy = this.db.select().from(schema.userPrivacySettings).where(eq(schema.userPrivacySettings.userId, profile.userId)).get();
    // Do not return the account id, staff role, name, email, seat, social links or private profile.
    return { ...(visible ? data : { badges: [], stats: null }), alias: profile.alias, aliasAnimal: privacy?.showAliasAnimalOnMap === false ? null : profile.aliasAnimal, garden };
  }

  async adminAliasProfile(viewerId: string, alias: string, profiles: ProfilesService) {
    if (alias.length > 80) throw ApiErrors.notFound();
    const profile = this.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.aliasLower, alias.trim().toLowerCase())).get();
    if (!profile?.alias || !needsAlias(profile)) throw ApiErrors.notFound();
    // The dedicated profile service rechecks SUPERADMIN, verification and restrictions, and audits the read.
    return profiles.getAdminProfile(viewerId, profile.userId);
  }
}
