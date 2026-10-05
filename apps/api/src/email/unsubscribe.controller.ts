import { Controller, Get, HttpCode, Inject, Ip, Post, Query } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { EmailUnsubscribeStatusDto } from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { env } from "../env.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { hashIp } from "../security/security-event.service.js";
import { verifyUnsubscribeToken } from "./unsubscribe-token.js";

/** Public, token-authenticated. POST doubles as the RFC 8058 one-click target, so it takes query params. */
@Controller("email/unsubscribe")
export class UnsubscribeController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  /** Read-only, so link scanners prefetching the URL never unsubscribe anyone. */
  @Get()
  async status(@Ip() ip: string, @Query("u") userId?: string, @Query("t") token?: string): Promise<EmailUnsubscribeStatusDto> {
    await this.throttle(ip);
    if (!isValid(userId, token)) return { valid: false, subscribed: false };
    const [pref] = await this.db
      .select({ on: schema.notificationPreferences.marketingEmails })
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, userId))
      .limit(1);
    return { valid: true, subscribed: pref?.on ?? true };
  }

  @Post()
  @HttpCode(200)
  async unsubscribe(@Ip() ip: string, @Query("u") userId?: string, @Query("t") token?: string): Promise<{ ok: true }> {
    await this.throttle(ip);
    if (!isValid(userId, token)) throw ApiErrors.forbidden("El enlace no es válido.");
    await this.db
      .insert(schema.notificationPreferences)
      .values({ userId, marketingEmails: false })
      .onConflictDoUpdate({ target: schema.notificationPreferences.userId, set: { marketingEmails: false, updatedAt: new Date() } });
    return { ok: true };
  }

  private async throttle(ip: string): Promise<void> {
    const result = await this.rateLimit.check(`email-unsub:${hashIp(ip)}`, 30, 60);
    if (!result.allowed) throw ApiErrors.rateLimited();
  }
}

function isValid(userId: string | undefined, token: string | undefined): userId is string {
  return typeof userId === "string" && typeof token === "string" && verifyUnsubscribeToken(userId, token, env.betterAuthSecret);
}
