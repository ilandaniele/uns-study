import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import type { Db } from "@sala/database";
import { presenceValidateSchema, type PresenceGrantDto, type PresenceResult } from "@sala/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { DB } from "../database/database.module.js";
import { PresenceService } from "./presence.service.js";

@Controller("presence")
@UseGuards(AuthGuard)
export class PresenceController {
  constructor(
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(DB) private readonly db: Db,
  ) {}

  /** Until when the caller may act in the room without sending a new fix (see `PresenceService.requirePresence`). */
  @Get("grant")
  async grant(@CurrentUser() user: RequestUser, @Query("roomId") roomId?: string): Promise<PresenceGrantDto> {
    if (!roomId || roomId.length > 100) throw ApiErrors.validation();
    const room = await this.rooms.findRoomRow(roomId);
    const expiresAt = await this.presence.grantExpiresAt(this.db, user.id, room.id);
    return { expiresAt: expiresAt ? expiresAt.toISOString() : null };
  }

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
