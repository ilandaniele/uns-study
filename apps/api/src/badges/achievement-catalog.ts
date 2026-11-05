import type { AchievementDto, BadgeId } from "@sala/contracts";
import { evaluateBadges } from "./badge-rules.js";

export const COLLABORATION_BADGES = [
  { id: "collaboration_10", title: "Primer mate", target: 10, tier: "bronze", category: "collaboration", metric: "places" },
  { id: "collaboration_25", title: "Bombilla compañera", target: 25, tier: "bronze", category: "collaboration", metric: "places" },
  { id: "collaboration_50", title: "Termo compartido", target: 50, tier: "silver", category: "collaboration", metric: "places" },
  { id: "collaboration_100", title: "Ronda de la sala", target: 100, tier: "gold", category: "collaboration", metric: "places" },
  { id: "collaboration_250", title: "Ceibo de la comunidad", target: 250, tier: "gold", category: "collaboration", metric: "places" },
  { id: "collaboration_500", title: "Hornero de la sala", target: 500, tier: "diamond", category: "collaboration", metric: "places" },
  { id: "free_5", title: "Mate disponible", target: 5, tier: "bronze", category: "free", metric: "freePlaces" },
  { id: "free_25", title: "Ronda abierta", target: 25, tier: "silver", category: "free", metric: "freePlaces" },
  { id: "free_100", title: "Sol de la sala", target: 100, tier: "gold", category: "free", metric: "freePlaces" },
  { id: "occupied_5", title: "Termo atento", target: 5, tier: "bronze", category: "occupied", metric: "occupiedPlaces" },
  { id: "occupied_25", title: "Ronda cuidada", target: 25, tier: "silver", category: "occupied", metric: "occupiedPlaces" },
  { id: "occupied_100", title: "Ceibo guardián", target: 100, tier: "gold", category: "occupied", metric: "occupiedPlaces" },
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
