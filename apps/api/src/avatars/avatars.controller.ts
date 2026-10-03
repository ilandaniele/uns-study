import { Body, Controller, Delete, Get, Headers, Inject, Ip, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { z } from "zod";
import { uploadAvatarSchema } from "@sala/contracts";
import { AuthGuard, OptionalAuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { hashIp } from "../security/security-event.service.js";
import { AvatarsService } from "./avatars.service.js";

// Shared with the upload/Google/delete actions below — they all touch the same avatar row, so a
// single per-user bucket is enough to stop abuse across all three.
const AVATAR_WRITE_BUCKET_LIMIT = 10;
const AVATAR_WRITE_BUCKET_WINDOW_S = 3600;
const AVATAR_READ_LIMIT_PER_IP = 300;
const AVATAR_READ_WINDOW_S = 60;

/** `POST/DELETE /profiles/me/avatar[/google]` — the authenticated owner manages their own photo. */
@Controller("profiles/me/avatar")
@UseGuards(AuthGuard)
export class ProfileAvatarController {
  constructor(
    @Inject(AvatarsService) private readonly avatars: AvatarsService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  private async checkWriteLimit(userId: string): Promise<void> {
    const limit = await this.rateLimit.check(`avatar-write:${userId}`, AVATAR_WRITE_BUCKET_LIMIT, AVATAR_WRITE_BUCKET_WINDOW_S);
    if (!limit.allowed) throw ApiErrors.rateLimited();
  }

  @Post()
  async upload(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(uploadAvatarSchema)) body: z.infer<typeof uploadAvatarSchema>,
  ) {
    await this.checkWriteLimit(user.id);
    const avatarUrl = await this.avatars.upload(user.id, body);
    return { avatarUrl };
  }

  @Delete()
  async remove(@CurrentUser() user: RequestUser) {
    await this.checkWriteLimit(user.id);
    await this.avatars.remove(user.id);
    return { ok: true };
  }

  @Post("google")
  async useGoogleImage(@CurrentUser() user: RequestUser) {
    await this.checkWriteLimit(user.id);
    const avatarUrl = await this.avatars.useGoogleImage(user.id, user.image);
    return { avatarUrl };
  }
}

/** `GET /avatars/:userId` — public; gated on the owner's `show_avatar` privacy, except that the owner
 *  themself always gets their own photo (so the /perfil preview works while it is still hidden). */
@Controller("avatars")
@UseGuards(OptionalAuthGuard)
export class PublicAvatarController {
  constructor(
    @Inject(AvatarsService) private readonly avatars: AvatarsService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  @Get(":userId")
  async get(
    @Param("userId") userId: string,
    @CurrentUser() viewer: RequestUser | undefined,
    @Ip() ip: string,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    const limit = await this.rateLimit.check(`avatar-read-ip:${hashIp(ip)}`, AVATAR_READ_LIMIT_PER_IP, AVATAR_READ_WINDOW_S);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    const avatar = await this.avatars.getForOwner(userId, viewer?.id === userId);
    const etag = `"${avatar.sha256}"`;
    res.setHeader("ETag", etag);
    // Never cached by shared caches (private), and always revalidated — `show_avatar` can be
    // toggled off at any moment and the response must reflect that on the very next request.
    // The body depends on who is asking (owner vs. others), hence `Vary: Cookie`.
    res.setHeader("Cache-Control", "private, no-cache");
    res.setHeader("Vary", "Cookie");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");

    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    res.setHeader("Content-Type", avatar.mimeType);
    res.status(200).send(avatar.bytes);
  }
}
