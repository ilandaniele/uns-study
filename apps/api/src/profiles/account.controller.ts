import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { deleteAccountSchema } from "@sala/contracts";
import type { z } from "zod";
import { AuthGuard } from "../auth/auth.guard.js";
import { AllowRestricted } from "../auth/allow-restricted.decorator.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { ProfilesService } from "./profiles.service.js";

/** Account deletion ("Eliminar cuenta"): checks the user out, then deletes the `user` row (cascades). */
@Controller("me")
@UseGuards(AuthGuard)
export class AccountController {
  constructor(
    @Inject(ProfilesService) private readonly profiles: ProfilesService,
    @Inject(CheckInService) private readonly checkIns: CheckInService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
  ) {}

  @Post("delete")
  @AllowRestricted()
  @HttpCode(200)
  async delete(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(deleteAccountSchema)) _body: z.infer<typeof deleteAccountSchema>,
  ) {
    const checkoutResult = await this.checkIns.checkOut(user.id);
    if (checkoutResult) await this.realtime.broadcastSeatChanges(checkoutResult.roomId, checkoutResult.changes);

    await this.profiles.deleteAccount(user.id);
    return { ok: true };
  }
}
