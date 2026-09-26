import { Controller, Get, Inject, Param } from "@nestjs/common";
import { RoomsService } from "./rooms.service.js";

@Controller("rooms")
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly rooms: RoomsService) {}

  @Get()
  list() {
    return this.rooms.listRooms();
  }

  @Get(":idOrSlug")
  get(@Param("idOrSlug") idOrSlug: string) {
    return this.rooms.getRoom(idOrSlug);
  }

  @Get(":idOrSlug/map")
  getMap(@Param("idOrSlug") idOrSlug: string) {
    return this.rooms.getRoomMap(idOrSlug);
  }
}
