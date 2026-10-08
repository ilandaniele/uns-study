import { Body, Controller, Inject, Ip, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { observationRequestSchema, type SeatStateChangedEvent } from "@sala/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { allInOrder } from "../common/background.js";
import { AntiAbuseService } from "../security/anti-abuse.service.js";
import { AbusePolicyService } from "../security/abuse-policy.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { RestrictionService } from "../users/restriction.service.js";
import { ObservationService } from "./observations.service.js";

@Controller("observations")
@UseGuards(AuthGuard)
export class ObservationsController {
  constructor(
    @Inject(ObservationService) private readonly observations: ObservationService,
    @Inject(AntiAbuseService) private readonly antiAbuse: AntiAbuseService,
    @Inject(AbusePolicyService) private readonly abusePolicy: AbusePolicyService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(observationRequestSchema)) body: z.infer<typeof observationRequestSchema>,
    @Ip() ip: string,
  ) {
    // Independent reads run concurrently; a failed restriction check still wins over the rest.
    const [, limits] = await allInOrder(
      this.restrictions.assertNot(user.id, ["RESTRICT_OBSERVATIONS", "SUSPENDED", "BANNED"]),
      this.abusePolicy.observationLimits(user.id),
    );

    const presence = await this.observations.assertPresence(user.id, body.roomId, body.location);

    await this.antiAbuse.enforceRateLimit({
      key: `observation:${user.id}`,
      limit: limits.perMinuteLimit,
      windowSeconds: 60,
      event: { userId: user.id, eventType: "RATE_LIMITED", ip, metadata: { bucket: "observation" } },
    });

    await this.antiAbuse.assertChallengePassed(user.id, body.turnstileToken, ip);

    const { roomId, changes, dispute } = await this.observations.observe({
      userId: user.id,
      roomId: body.roomId,
      seatId: body.seatId,
      status: body.status,
      location: body.location,
      presence,
      ip,
      qrToken: body.qrToken,
      limits,
    });
    await this.realtime.broadcastSeatChanges(roomId, changes);
    // The resulting seat states (server timestamps) let the client confirm its optimistic update
    // right away; an empty list means the observation didn't change any seat.
    const seats: SeatStateChangedEvent[] = changes.map((change) => ({
      roomId,
      seatId: change.seatId,
      status: change.status,
      confidence: change.confidence,
      lastUpdatedAt: change.lastUpdatedAt.toISOString(),
      verified: change.verified,
      occupiedUntil: change.occupiedUntil ? change.occupiedUntil.toISOString() : null,
    }));
    // `dispute`: the vote an "Está libre" report opened (or joined), so the reporter sees it.
    return { ok: true, seats, dispute };
  }
}
