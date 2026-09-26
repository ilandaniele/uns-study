import { Body, Controller, Get, Inject, Param, Patch, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { updatePrivacySchema, updateProfileSchema } from "@uns/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ProfilesService } from "./profiles.service.js";

@Controller()
@UseGuards(AuthGuard)
export class ProfilesController {
  constructor(@Inject(ProfilesService) private readonly profiles: ProfilesService) {}

  @Get("profiles/me")
  async getMe(@CurrentUser() user: RequestUser) {
    return this.profiles.getMyProfile(user.id, user.email);
  }

  @Patch("profiles/me")
  async updateMe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(updateProfileSchema)) body: z.infer<typeof updateProfileSchema>,
  ) {
    return this.profiles.updateMyProfile(user.id, user.email, body);
  }

  @Get("profiles/me/privacy")
  async getMyPrivacy(@CurrentUser() user: RequestUser) {
    return this.profiles.getMyPrivacy(user.id);
  }

  @Patch("profiles/me/privacy")
  async updateMyPrivacy(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(updatePrivacySchema)) body: z.infer<typeof updatePrivacySchema>,
  ) {
    return this.profiles.updateMyPrivacy(user.id, body);
  }

  @Get("profiles/:userId")
  async getPublicProfile(@CurrentUser() user: RequestUser, @Param("userId") userId: string) {
    return this.profiles.getPublicProfile(user.id, userId);
  }
}
