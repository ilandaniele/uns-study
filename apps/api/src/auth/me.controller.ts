import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { MeDto } from "@uns/contracts";
import { OptionalAuthGuard } from "./auth.guard.js";
import { CurrentUser } from "./current-user.decorator.js";
import type { RequestUser } from "./request-user.js";
import { CheckInService } from "../checkins/checkins.service.js";

@Controller("me")
@UseGuards(OptionalAuthGuard)
export class MeController {
  constructor(@Inject(CheckInService) private readonly checkIns: CheckInService) {}

  @Get()
  async get(@CurrentUser() user: RequestUser | undefined): Promise<MeDto> {
    if (!user) return { user: null, activeCheckIn: null };
    const activeCheckIn = await this.checkIns.getActiveCheckIn(user.id);
    return { user, activeCheckIn };
  }
}
