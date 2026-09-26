import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import type { RankingCategory, RankingPeriod } from "@uns/contracts";
import { OptionalAuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { RankingsService } from "./rankings.service.js";

const PERIODS: RankingPeriod[] = ["today", "week", "month", "all"];
const CATEGORIES: RankingCategory[] = ["study_time", "streak", "contribution"];

/** Public read (personalized with `me` when a session is present). */
@Controller("rooms/:idOrSlug/rankings")
@UseGuards(OptionalAuthGuard)
export class RankingsController {
  constructor(@Inject(RankingsService) private readonly rankings: RankingsService) {}

  @Get()
  get(
    @Param("idOrSlug") idOrSlug: string,
    @Query("period") period: string | undefined,
    @Query("category") category: string | undefined,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    const safePeriod = PERIODS.includes(period as RankingPeriod) ? (period as RankingPeriod) : "today";
    const safeCategory = CATEGORIES.includes(category as RankingCategory) ? (category as RankingCategory) : "study_time";
    return this.rankings.getRankings(idOrSlug, safePeriod, safeCategory, user?.id ?? null);
  }
}
