import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { OptionalAuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { UuidParamPipe } from "../common/uuid-param.pipe.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { DisputeService } from "./disputes.service.js";

/** Public read (personalized with `myVote`/`iAm*` when a session is present). */
@Controller("disputes")
@UseGuards(OptionalAuthGuard)
export class DisputeReadsController {
  constructor(@Inject(DisputeService) private readonly disputes: DisputeService) {}

  @Get(":id")
  get(@Param("id", UuidParamPipe) id: string, @CurrentUser() user: RequestUser | undefined) {
    return this.disputes.getById(id, user?.id ?? null);
  }
}

/** Public read (personalized with `myVote`/`iAm*` when a session is present). */
@Controller("rooms/:idOrSlug/disputes")
@UseGuards(OptionalAuthGuard)
export class RoomDisputesController {
  constructor(
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(DisputeService) private readonly disputes: DisputeService,
  ) {}

  @Get()
  async list(@Param("idOrSlug") idOrSlug: string, @CurrentUser() user: RequestUser | undefined) {
    const room = await this.rooms.findRoomRow(idOrSlug);
    return this.disputes.listOpenForRoom(room.id, user?.id ?? null);
  }
}
