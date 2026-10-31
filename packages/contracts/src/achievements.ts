import { z } from "zod";
import type { BadgeDto, BadgeId } from "./pro";
import type { SharedGardenDto } from "./garden";

export const COLLABORATION_PLACES_PER_SEED = 10;
export const COLLABORATION_DAILY_SEED_CAP = 10;
export const COLLABORATION_REWARD_PLACES = 30;
export const COLLABORATION_REWARD_SEEDS = 30;
export const COLLABORATION_REWARD_PRO_DAYS = 7;
export const COLLABORATION_REWARD_COOLDOWN_DAYS = 7;
export interface CollaborationRewardDto {
  id: string;
  places: number;
  seeds: number;
  earnedAt: string;
  proExpiresAt: string;
}
export const ADMIN_APPLICATION_MIN_PLACES = 100;
export const ADMIN_APPLICATION_MIN_DAYS = 3;
export type AchievementTier = "bronze" | "silver" | "gold" | "diamond";
export type AdminApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";
export interface AchievementDto extends BadgeDto { tier: AchievementTier; earnedAt: string | null }
export interface CollaborationProgressDto {
  places: number;
  days: number;
  seeds: number;
  todayPlaces: number;
  todaySeeds: number;
  nextSeedPlaces: number;
  eligibleForAdmin: boolean;
  applicationStatus: AdminApplicationStatus | null;
  weeklyReward?: { targetPlaces: number; seeds: number; proDays: number; nextEligibleAt: string | null; emailVerified: boolean };
}
export interface AchievementStatsDto { studyMinutes: number; studyDays: number }
export interface AchievementsDto {
  badges: AchievementDto[];
  unseenIds: BadgeId[];
  stats: AchievementStatsDto;
  collaboration: CollaborationProgressDto;
  /** Private, unacknowledged, still-active promotional rewards. Never returned in public profiles. */
  rewards?: CollaborationRewardDto[];
}
export interface PublicAchievementsDto {
  badges: AchievementDto[];
  stats: (AchievementStatsDto & { places: number; weekRank: number | null }) | null;
}
export interface AliasProfileDto extends PublicAchievementsDto {
  alias: string;
  aliasAnimal: string | null;
  garden: SharedGardenDto;
}
export interface AdminApplicationDto {
  userId: string;
  displayName: string;
  requestedAt: string;
  places: number;
  days: number;
}
const badgeIds = ["first_session", "hours_10", "hours_50", "hours_100", "streak_7", "streak_30", "early_bird", "night_owl", "collaboration_10", "collaboration_50", "collaboration_100", "collaboration_500"] as const;
export const seenAchievementsSchema = z.object({ ids: z.array(z.enum(badgeIds)).min(1).max(badgeIds.length) }).strict();
export const reviewAdminApplicationSchema = z.object({ approve: z.boolean() }).strict();
