import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { testGeofenceSchema, updateGeofenceSchema } from "@uns/contracts";
import { AdminGuard, AdminOnlyGuard } from "../users/admin.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { AdminRoomsService } from "./admin-rooms.service.js";

@Controller("admin/rooms")
@UseGuards(AdminGuard)
export class AdminRoomsController {
  constructor(
    @Inject(AdminRoomsService) private readonly rooms: AdminRoomsService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  @Get(":idOrSlug/live")
  live(@Param("idOrSlug") idOrSlug: string) {
    return this.rooms.live(idOrSlug);
  }

  @Get(":idOrSlug/stats")
  stats(@Param("idOrSlug") idOrSlug: string) {
    return this.rooms.stats(idOrSlug);
  }

  @Get(":idOrSlug/geofence")
  getGeofence(@Param("idOrSlug") idOrSlug: string) {
    return this.rooms.getGeofence(idOrSlug);
  }

  @Post(":idOrSlug/geofence/test")
  async testGeofence(
    @Param("idOrSlug") idOrSlug: string,
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(testGeofenceSchema)) body: z.infer<typeof testGeofenceSchema>,
  ) {
    const limit = await this.rateLimit.check(`admin:geofence-test:${user.id}`, 20, 60);
    if (!limit.allowed) throw ApiErrors.rateLimited();
    return this.rooms.testGeofence(idOrSlug, body.location);
  }

  @Put(":idOrSlug/geofence")
  @UseGuards(AdminOnlyGuard)
  updateGeofence(
    @Param("idOrSlug") idOrSlug: string,
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(updateGeofenceSchema)) body: z.infer<typeof updateGeofenceSchema>,
  ) {
    return this.rooms.updateGeofence(idOrSlug, user.id, body);
  }
}
