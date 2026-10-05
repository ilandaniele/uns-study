import { Body, Controller, Get, Inject, Put, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { updateNotificationPreferencesSchema } from "@sala/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { NotificationPreferencesService } from "./notification-preferences.service.js";

@Controller("notifications/preferences")
@UseGuards(AuthGuard)
export class NotificationPreferencesController {
  constructor(
    @Inject(NotificationPreferencesService) private readonly preferences: NotificationPreferencesService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.preferences.get(user.id);
  }

  @Put()
  async update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(updateNotificationPreferencesSchema)) body: z.infer<typeof updateNotificationPreferencesSchema>,
  ) {
    const limit = await this.rateLimit.check(`notif-prefs:${user.id}`, 30, 3600);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    return this.preferences.update(user.id, body);
  }
}
