import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { RoomPeopleService } from "./room-people.service.js";

@Controller("rooms")
@UseGuards(AuthGuard)
export class RoomPeopleController {
  constructor(
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(RoomPeopleService) private readonly roomPeople: RoomPeopleService,
  ) {}

  @Get(":idOrSlug/people")
  async people(@Param("idOrSlug") idOrSlug: string, @CurrentUser() user: RequestUser) {
    const room = await this.rooms.findRoomRow(idOrSlug);
    return this.roomPeople.listPeople(room.id, user.id);
  }

  @Get(":idOrSlug/occupants")
  async occupants(@Param("idOrSlug") idOrSlug: string, @CurrentUser() user: RequestUser) {
    const room = await this.rooms.findRoomRow(idOrSlug);
    return this.roomPeople.listOccupants(room.id, user.id);
  }
}
