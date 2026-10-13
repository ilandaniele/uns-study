import { Controller, Get, HttpCode, Inject, Ip, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { OptionalAuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { AntiAbuseService } from "../security/anti-abuse.service.js";
import { RoomStatsService } from "./room-stats.service.js";

/** Public (optional auth): visitor counting and the caller's daily contribution count. */
@Controller("rooms/:idOrSlug")
@UseGuards(OptionalAuthGuard)
export class RoomStatsController {
  constructor(
    @Inject(RoomStatsService) private readonly stats: RoomStatsService,
    @Inject(AntiAbuseService) private readonly antiAbuse: AntiAbuseService,
  ) {}

  @Post("visits")
  @HttpCode(204)
  async recordVisit(@Param("idOrSlug") idOrSlug: string, @CurrentUser() user: RequestUser | undefined, @Ip() ip: string): Promise<void> {
    await this.antiAbuse.enforceRateLimit({ key: `room-visit:${user?.id ?? ip}`, limit: 20, windowSeconds: 60 });
    await this.stats.recordVisit(idOrSlug, { userId: user?.id ?? null, ip });
  }

  @Get("stats/today")
  async today(
    @Param("idOrSlug") idOrSlug: string,
    @CurrentUser() user: RequestUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Personalised for signed-in callers, so never let a shared cache mix the two.
    res.setHeader("Vary", "Cookie");
    res.setHeader("Cache-Control", "private, no-cache");
    return this.stats.getToday(idOrSlug, user?.id ?? null);
  }
}
