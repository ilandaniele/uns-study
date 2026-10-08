import { Body, Controller, Inject, Ip, Param, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { incumbentRespondSchema, openDisputeSchema, voteDisputeSchema } from "@sala/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { UuidParamPipe } from "../common/uuid-param.pipe.js";
import { AntiAbuseService } from "../security/anti-abuse.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { DisputeService } from "./disputes.service.js";

/** Every action here mutates a dispute and requires an authenticated session. */
@Controller("disputes")
@UseGuards(AuthGuard)
export class DisputesController {
  constructor(
    @Inject(DisputeService) private readonly disputes: DisputeService,
    @Inject(AntiAbuseService) private readonly antiAbuse: AntiAbuseService,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
  ) {}

  @Post()
  async open(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(openDisputeSchema)) body: z.infer<typeof openDisputeSchema>,
    @Ip() ip: string,
  ) {
    await this.restrictions.assertNot(user.id, ["RESTRICT_OBSERVATIONS", "SUSPENDED", "BANNED"]);

    const presence = await this.disputes.assertPresence(user.id, body.roomId, body.location);

    await this.antiAbuse.enforceRateLimit({
      key: `dispute:open:${user.id}`,
      limit: 3,
      windowSeconds: 3600,
      event: { userId: user.id, eventType: "DISPUTE_SPAM", ip, metadata: { bucket: "dispute_open" } },
    });

    const { dispute } = await this.disputes.open({
      userId: user.id,
      roomId: body.roomId,
      seatId: body.seatId,
      kind: body.kind,
      location: body.location,
      presence,
    });
    return dispute;
  }

  @Post(":id/votes")
  async vote(
    @CurrentUser() user: RequestUser,
    @Param("id", UuidParamPipe) id: string,
    @Body(new ZodBodyPipe(voteDisputeSchema)) body: z.infer<typeof voteDisputeSchema>,
  ) {
    await this.antiAbuse.enforceRateLimit({ key: `dispute:vote:${user.id}`, limit: 20, windowSeconds: 600 });

    return this.disputes.vote(id, user.id, body.vote, body.location);
  }

  @Post(":id/respond")
  async respond(
    @CurrentUser() user: RequestUser,
    @Param("id", UuidParamPipe) id: string,
    @Body(new ZodBodyPipe(incumbentRespondSchema)) body: z.infer<typeof incumbentRespondSchema>,
  ) {
    await this.antiAbuse.enforceRateLimit({ key: `dispute:respond:${user.id}`, limit: 5, windowSeconds: 60 });

    const { dispute } = await this.disputes.respond(id, user.id, body.action, body.location);
    return dispute;
  }
}
