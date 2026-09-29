import { Body, Controller, Get, Inject, Put, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { updateNotificationPreferencesSchema } from "@uns/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { NotificationPreferencesService } from "./notification-preferences.service.js";

@Controller("notifications/preferences")
@UseGuards(AuthGuard)
export class NotificationPreferencesController {
  constructor(@Inject(NotificationPreferencesService) private readonly preferences: NotificationPreferencesService) {}

  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.preferences.get(user.id);
  }

  @Put()
  update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(updateNotificationPreferencesSchema)) body: z.infer<typeof updateNotificationPreferencesSchema>,
  ) {
    return this.preferences.update(user.id, body);
  }
}
