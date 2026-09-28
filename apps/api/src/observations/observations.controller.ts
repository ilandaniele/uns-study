import { Body, Controller, Inject, Ip, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { observationRequestSchema } from "@uns/contracts";
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
import { ObservationService } from "./observations.service.js";

@Controller("observations")
@UseGuards(AuthGuard)
export class ObservationsController {
  constructor(
    @Inject(ObservationService) private readonly observations: ObservationService,
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
    @Body(new ZodBodyPipe(observationRequestSchema)) body: z.infer<typeof observationRequestSchema>,
    @Ip() ip: string,
  ) {
    await this.restrictions.assertNot(user.id, ["RESTRICT_OBSERVATIONS", "SUSPENDED", "BANNED"]);

    await this.observations.assertPresence(body.roomId, body.location);

    const limits = await this.abusePolicy.observationLimits(user.id);
    const limit = await this.rateLimit.check(`observation:${user.id}`, limits.perMinuteLimit, 60);
    if (!limit.allowed) {
      await this.securityEvents.record({ userId: user.id, eventType: "RATE_LIMITED", ip, metadata: { bucket: "observation" } });
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

    const { roomId, changes } = await this.observations.observe({
      userId: user.id,
      roomId: body.roomId,
      seatId: body.seatId,
      status: body.status,
      location: body.location,
      ip,
      qrToken: body.qrToken,
    });
    await this.realtime.broadcastSeatChanges(roomId, changes);
    return { ok: true };
  }
}
