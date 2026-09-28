import { Body, Controller, Delete, HttpCode, Inject, Ip, Param, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { checkInPhotoRequestSchema, checkInRequestSchema, extendRequestSchema, type LocationInput } from "@uns/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { SecurityEventService, hashIp } from "../security/security-event.service.js";
import { AbusePolicyService } from "../security/abuse-policy.service.js";
import { TurnstileService } from "../security/turnstile.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { PresenceService } from "../presence/presence.service.js";
import { CheckInService, presenceMessage } from "./checkins.service.js";
import { PhotoVerificationService } from "./photo-verification.service.js";

@Controller("checkins")
@UseGuards(AuthGuard)
export class CheckInsController {
  constructor(
    @Inject(CheckInService) private readonly checkIns: CheckInService,
    @Inject(PhotoVerificationService) private readonly photoVerification: PhotoVerificationService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(SecurityEventService) private readonly securityEvents: SecurityEventService,
    @Inject(AbusePolicyService) private readonly abusePolicy: AbusePolicyService,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(PresenceService) private readonly presence: PresenceService,
  ) {}

  /** Cheap presence pre-check so a rejected fix never eats into the rate-limit budget below. */
  private async assertPresence(roomId: string, location: LocationInput): Promise<void> {
    const room = await this.rooms.findRoomRow(roomId);
    const result = this.presence.validate(room, location);
    if (!result.valid) throw ApiErrors.presenceRejected(result.reason!, presenceMessage(result.reason!), result.details);
  }

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(checkInRequestSchema)) body: z.infer<typeof checkInRequestSchema>,
    @Ip() ip: string,
  ) {
    await this.restrictions.assertNot(user.id, ["SUSPENDED", "BANNED"]);

    await this.assertPresence(body.roomId, body.location);

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

    // The body carries no roomId for extend — the room is whatever the caller is currently
    // checked into, never client-supplied.
    const active = await this.checkIns.getActiveCheckIn(user.id);
    if (!active) throw ApiErrors.noActiveCheckIn();
    await this.assertPresence(active.roomId, body.location);

    const limit = await this.rateLimit.check(`extend:${user.id}`, 5, 60);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    return this.checkIns.extend(user.id, body.location);
  }

  @Post(":id/photo")
  async verifyPhoto(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(checkInPhotoRequestSchema)) body: z.infer<typeof checkInPhotoRequestSchema>,
    @Ip() ip: string,
  ) {
    await this.restrictions.assertNot(user.id, ["SUSPENDED", "BANNED"]);

    // Same as extend: no roomId in the body, so the room comes from the caller's own active
    // check-in — never trust a room the client didn't have to prove it's currently checked into.
    const active = await this.checkIns.getActiveCheckIn(user.id);
    if (!active) throw ApiErrors.noActiveCheckIn();
    await this.assertPresence(active.roomId, body.location);

    const limit = await this.rateLimit.check(`checkin-photo:${user.id}`, 6, 3600);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    // A per-IP bucket on top of the per-user one — makes bulk-account abuse (many accounts, same
    // device/IP, hammering the verifier) expensive too. Keyed by a salted hash, never the raw IP.
    const ipLimit = await this.rateLimit.check(`checkin-photo-ip:${hashIp(ip)}`, 20, 3600);
    if (!ipLimit.allowed) throw ApiErrors.rateLimited();

    const { result, changes } = await this.photoVerification.verify({
      userId: user.id,
      checkInId: id,
      image: body.image,
      location: body.location,
    });
    if (changes.length) await this.realtime.broadcastSeatChanges(result.checkIn.roomId, changes);
    return result;
  }
}
