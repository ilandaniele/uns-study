import { Body, Controller, Inject, Patch, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { updateCheckInIdentitySchema } from "@uns/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ProfilesService } from "./profiles.service.js";

/** Lets the caller toggle "Mostrar mi identidad" on their current check-in without re-checking-in. */
@Controller("checkins")
@UseGuards(AuthGuard)
export class CheckInIdentityController {
  constructor(@Inject(ProfilesService) private readonly profiles: ProfilesService) {}

  @Patch("current/identity")
  async update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(updateCheckInIdentitySchema)) body: z.infer<typeof updateCheckInIdentitySchema>,
  ) {
    return this.profiles.updateCheckInIdentity(user.id, body.showIdentity);
  }
}
