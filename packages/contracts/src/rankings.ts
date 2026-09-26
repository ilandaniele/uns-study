export type RankingPeriod = "today" | "week" | "month" | "all";
export type RankingCategory = "study_time" | "streak" | "contribution";

export interface RankingEntryDto {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** minutes | days | points, depending on `category`. */
  value: number;
}

export interface RankingDto {
  period: RankingPeriod;
  category: RankingCategory;
  entries: RankingEntryDto[];
  me: RankingEntryDto | null;
}
