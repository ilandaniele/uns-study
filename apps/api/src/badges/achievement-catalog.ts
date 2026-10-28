import type { AchievementDto, BadgeId } from "@sala/contracts";
import { evaluateBadges } from "./badge-rules.js";

export const COLLABORATION_BADGES = [
  { id: "collaboration_10", title: "Mano amiga", target: 10, tier: "bronze" },
  { id: "collaboration_50", title: "Guardián del mapa", target: 50, tier: "silver" },
  { id: "collaboration_100", title: "Referente de la sala", target: 100, tier: "gold" },
  { id: "collaboration_500", title: "Pilar de la comunidad", target: 500, tier: "diamond" },
] as const;
const studyBadges = evaluateBadges({ totalMinutes: 0, sessionCount: 0, longestStreak: 0, hasEarly: false, hasLate: false });
export type FeaturedAchievement = Pick<AchievementDto, "id" | "title" | "tier">;
export function achievementPresentation(id: string): FeaturedAchievement | null {
  const community = COLLABORATION_BADGES.find(badge => badge.id === id);
  if (community) return { id: community.id, title: community.title, tier: community.tier };
  const study = studyBadges.find(badge => badge.id === id);
  if (!study) return null;
  return { id: id as BadgeId, title: study.title, tier: id === "hours_100" || id === "streak_30" ? "diamond" : id === "hours_50" || id === "streak_7" ? "gold" : id === "first_session" || id === "hours_10" ? "bronze" : "silver" };
}
export const ACHIEVEMENT_TIER_RANK = { bronze: 1, silver: 2, gold: 3, diamond: 4 } as const;
