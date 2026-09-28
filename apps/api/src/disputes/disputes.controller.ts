import { Body, Controller, Inject, Ip, Param, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { incumbentRespondSchema, openDisputeSchema, voteDisputeSchema } from "@uns/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { UuidParamPipe } from "../common/uuid-param.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { DisputeService } from "./disputes.service.js";

/** Every action here mutates a dispute and requires an authenticated session. */
@Controller("disputes")
@UseGuards(AuthGuard)
export class DisputesController {
  constructor(
    @Inject(DisputeService) private readonly disputes: DisputeService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(SecurityEventService) private readonly securityEvents: SecurityEventService,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
  ) {}

  @Post()
  async open(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(openDisputeSchema)) body: z.infer<typeof openDisputeSchema>,
    @Ip() ip: string,
  ) {
    await this.restrictions.assertNot(user.id, ["RESTRICT_OBSERVATIONS", "SUSPENDED", "BANNED"]);

    const limit = await this.rateLimit.check(`dispute:open:${user.id}`, 3, 3600);
    if (!limit.allowed) {
      await this.securityEvents.record({ userId: user.id, eventType: "DISPUTE_SPAM", ip, metadata: { bucket: "dispute_open" } });
      throw ApiErrors.rateLimited();
    }

    const { dispute } = await this.disputes.open({
      userId: user.id,
      roomId: body.roomId,
      seatId: body.seatId,
      kind: body.kind,
      location: body.location,
    });
    return dispute;
  }

  @Post(":id/votes")
  async vote(
    @CurrentUser() user: RequestUser,
    @Param("id", UuidParamPipe) id: string,
    @Body(new ZodBodyPipe(voteDisputeSchema)) body: z.infer<typeof voteDisputeSchema>,
  ) {
    const limit = await this.rateLimit.check(`dispute:vote:${user.id}`, 20, 600);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    return this.disputes.vote(id, user.id, body.vote, body.location);
  }

  @Post(":id/respond")
  async respond(
    @CurrentUser() user: RequestUser,
    @Param("id", UuidParamPipe) id: string,
    @Body(new ZodBodyPipe(incumbentRespondSchema)) body: z.infer<typeof incumbentRespondSchema>,
  ) {
    const limit = await this.rateLimit.check(`dispute:respond:${user.id}`, 5, 60);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    const { dispute } = await this.disputes.respond(id, user.id, body.action, body.location);
    return dispute;
  }
}
