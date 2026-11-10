import { z } from "zod";
import { BADGE_IDS, type BadgeDto, type BadgeId } from "./pro";
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
export type AchievementCategory = "study" | "collaboration" | "free" | "occupied";
export type BadgeMotif = "mate" | "bombilla" | "termo" | "sol" | "ceibo" | "hornero" | "bandera";
export const BADGE_MOTIFS = {
  first_session: "mate", hours_10: "mate", hours_50: "termo", hours_100: "hornero",
  streak_7: "bandera", streak_30: "ceibo", early_bird: "sol", night_owl: "mate",
  collaboration_10: "mate", collaboration_25: "bombilla", collaboration_50: "termo",
  collaboration_100: "bandera", collaboration_250: "ceibo", collaboration_500: "hornero",
  free_5: "mate", free_25: "bombilla", free_100: "sol",
  occupied_5: "termo", occupied_25: "bandera", occupied_100: "ceibo",
} as const satisfies Record<BadgeId, BadgeMotif>;
export interface AchievementDto extends BadgeDto { tier: AchievementTier; earnedAt: string | null; category?: AchievementCategory }
export interface CollaborationProgressDto {
  places: number;
  freePlaces: number;
  occupiedPlaces: number;
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
  badgesVisible?: boolean;
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
export const seenAchievementsSchema = z.object({ ids: z.array(z.enum(BADGE_IDS)).min(1).max(BADGE_IDS.length) }).strict();
export const reviewAdminApplicationSchema = z.object({ approve: z.boolean() }).strict();
