import { Body, Controller, Delete, HttpCode, Inject, Ip, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { checkInRequestSchema, extendRequestSchema } from "@uns/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { AbusePolicyService } from "../security/abuse-policy.service.js";
import { TurnstileService } from "../security/turnstile.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { RestrictionService } from "../users/restriction.service.js";
import { CheckInService } from "./checkins.service.js";

@Controller("checkins")
@UseGuards(AuthGuard)
export class CheckInsController {
  constructor(
    @Inject(CheckInService) private readonly checkIns: CheckInService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(SecurityEventService) private readonly securityEvents: SecurityEventService,
    @Inject(AbusePolicyService) private readonly abusePolicy: AbusePolicyService,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(checkInRequestSchema)) body: z.infer<typeof checkInRequestSchema>,
    @Ip() ip: string,
  ) {
    await this.restrictions.assertNot(user.id, ["SUSPENDED", "BANNED"]);

    const limit = await this.rateLimit.check(`checkin:${user.id}`, 5, 60);
    if (!limit.allowed) {
      await this.securityEvents.record({ userId: user.id, eventType: "RATE_LIMITED", ip, metadata: { bucket: "checkin" } });
      throw ApiErrors.rateLimited();
    }

    if (await this.abusePolicy.requiresChallenge(user.id)) {
      const verified = await this.turnstile.verify(body.turnstileToken, ip);
      if (!verified) {
        if (body.turnstileToken) {
          await this.securityEvents.record({ userId: user.id, eventType: "TURNSTILE_FAILED", ip });
        }
        throw ApiErrors.turnstileRequired();
      }
    }

    const { checkIn, changes } = await this.checkIns.checkIn({
      userId: user.id,
      roomId: body.roomId,
      seatId: body.seatId,
      location: body.location,
      showIdentity: body.showIdentity,
      qrToken: body.qrToken,
    });
    await this.realtime.broadcastSeatChanges(body.roomId, changes);
    return checkIn;
  }

  @Delete("current")
  @HttpCode(200)
  async remove(@CurrentUser() user: RequestUser) {
    const result = await this.checkIns.checkOut(user.id);
    if (!result) throw ApiErrors.noActiveCheckIn();
    await this.realtime.broadcastSeatChanges(result.roomId, result.changes);
    return { ok: true };
  }

  @Post("current/extend")
  async extend(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(extendRequestSchema)) body: z.infer<typeof extendRequestSchema>,
  ) {
    await this.restrictions.assertNot(user.id, ["SUSPENDED", "BANNED"]);

    const limit = await this.rateLimit.check(`extend:${user.id}`, 5, 60);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    return this.checkIns.extend(user.id, body.location);
  }
}
