export type RankingPeriod = "today" | "week" | "month" | "all";
export type RankingCategory = "study_time" | "streak" | "contribution";

export interface RankingEntryDto {
  rank: number;
  /** `null` when the entry isn't linkable — not opted into room visibility, or shown under an
   *  alias — so the viewer can never resolve who's behind the fun name. */
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  /** Catalog id of the alias animal when the name shown is the alias (hidden user); the UI draws it instead of initials. */
  aliasAnimal?: string | null;
  /** Draw the gold "Admin" badge (visible identities only). */
  adminBadge?: boolean;
  /** True for the viewer's own row, so the UI can highlight it even when `userId` is `null`. */
  isMe: boolean;
  /** minutes | days | points, depending on `category`. */
  value: number;
}

export interface RankingDto {
  period: RankingPeriod;
  category: RankingCategory;
  entries: RankingEntryDto[];
  me: RankingEntryDto | null;
}
