import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { presenceValidateSchema, type PresenceResult } from "@sala/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { PresenceService } from "./presence.service.js";

@Controller("presence")
@UseGuards(AuthGuard)
export class PresenceController {
  constructor(
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  @Post("validate")
  async validate(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(presenceValidateSchema)) body: z.infer<typeof presenceValidateSchema>,
  ): Promise<PresenceResult> {
    const limit = await this.rateLimit.check(`presence:${user.id}`, 10, 60);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    const room = await this.rooms.findRoomRow(body.roomId);
    return this.presence.validate(room, {
      latitude: body.latitude,
      longitude: body.longitude,
      accuracy: body.accuracy,
      capturedAt: body.capturedAt,
      sentAt: body.sentAt,
    });
  }
}
