import { Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import type { SubscriptionCheckoutDto, SubscriptionDto } from "@sala/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { SubscriptionsService } from "./subscriptions.service.js";

const LIMIT = 5;
const WINDOW_S = 3600;

/** `/subscriptions/*`: the authenticated user manages their own ad-free subscription. */
@Controller("subscriptions")
@UseGuards(AuthGuard)
export class SubscriptionsController {
  constructor(
    @Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  private async checkLimit(key: string): Promise<void> {
    const limit = await this.rateLimit.check(key, LIMIT, WINDOW_S);
    if (!limit.allowed) throw ApiErrors.rateLimited();
  }

  @Get("me")
  me(@CurrentUser() user: RequestUser): Promise<SubscriptionDto> {
    return this.subscriptions.getForUser(user.id);
  }

  @Post("checkout")
  async checkout(@CurrentUser() user: RequestUser): Promise<SubscriptionCheckoutDto> {
    await this.checkLimit(`subs:checkout:${user.id}`);
    return this.subscriptions.checkout(user);
  }

  @Post("cancel")
  async cancel(@CurrentUser() user: RequestUser): Promise<SubscriptionDto> {
    await this.checkLimit(`subs:cancel:${user.id}`);
    return this.subscriptions.cancel(user.id);
  }
}
