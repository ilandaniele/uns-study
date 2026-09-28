import { Body, Controller, Delete, Get, Inject, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { z } from "zod";
import { uploadAvatarSchema } from "@uns/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { AvatarsService } from "./avatars.service.js";

/** `POST/DELETE /profiles/me/avatar[/google]` — the authenticated owner manages their own photo. */
@Controller("profiles/me/avatar")
@UseGuards(AuthGuard)
export class ProfileAvatarController {
  constructor(
    @Inject(AvatarsService) private readonly avatars: AvatarsService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  async upload(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(uploadAvatarSchema)) body: z.infer<typeof uploadAvatarSchema>,
  ) {
    const limit = await this.rateLimit.check(`avatar-upload:${user.id}`, 10, 3600);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    const avatarUrl = await this.avatars.upload(user.id, body);
    return { avatarUrl };
  }

  @Delete()
  async remove(@CurrentUser() user: RequestUser) {
    await this.avatars.remove(user.id);
    return { ok: true };
  }

  @Post("google")
  async useGoogleImage(@CurrentUser() user: RequestUser) {
    const avatarUrl = await this.avatars.useGoogleImage(user.id, user.image);
    return { avatarUrl };
  }
}

/** `GET /avatars/:userId` — public, unauthenticated; gated on the owner's `show_avatar` privacy. */
@Controller("avatars")
export class PublicAvatarController {
  constructor(@Inject(AvatarsService) private readonly avatars: AvatarsService) {}

  @Get(":userId")
  async get(@Param("userId") userId: string, @Res({ passthrough: false }) res: Response) {
    const avatar = await this.avatars.getForOwner(userId);
    res.setHeader("Content-Type", avatar.mimeType);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.status(200).send(avatar.bytes);
  }
}
