import { Body, Controller, Delete, Get, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { pushSubscriptionSchema, unsubscribePushSchema, type VapidPublicKeyDto } from "@sala/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { env } from "../env.js";
import { PushService } from "./push.service.js";
import { PushSubscriptionsService } from "./push-subscriptions.service.js";

/** Public — the web app needs this before it knows whether the visitor is signed in. */
@Controller("notifications/vapid-public-key")
export class VapidPublicKeyController {
  @Get()
  get(): VapidPublicKeyDto {
    return { publicKey: env.vapidPublicKey };
  }
}

@Controller("notifications/push-subscriptions")
@UseGuards(AuthGuard)
export class PushSubscriptionsController {
  constructor(
    @Inject(PushSubscriptionsService) private readonly subscriptions: PushSubscriptionsService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(PushService) private readonly push: PushService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(pushSubscriptionSchema)) body: z.infer<typeof pushSubscriptionSchema>,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const limit = await this.rateLimit.check(`push-sub:${user.id}`, 10, 3600);
    if (!limit.allowed) throw ApiErrors.rateLimited();
    await this.subscriptions.subscribe(user.id, body, userAgent ?? null);
    return { ok: true };
  }

  /**
   * Sends a test notification to the caller's own devices, so anyone can check that push works on
   * their phone without a second account. Returns per-device counts, never endpoints.
   */
  @Post("test")
  async test(@CurrentUser() user: RequestUser) {
    const limit = await this.rateLimit.check(`push-test:${user.id}`, 5, 600);
    if (!limit.allowed) throw ApiErrors.rateLimited();
    const summary = await this.push.sendToUser(user.id, {
      title: "Notificación de prueba",
      body: "Si ves esto, las notificaciones funcionan en este dispositivo.",
      url: "/perfil",
      tag: "push-test",
    });
    return summary ?? { devices: 0, accepted: 0, gone: 0, failed: 0, unconfigured: true };
  }

  @Delete()
  async remove(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(unsubscribePushSchema)) body: z.infer<typeof unsubscribePushSchema>,
  ) {
    await this.subscriptions.unsubscribe(user.id, body.endpoint);
    return { ok: true };
  }
}
