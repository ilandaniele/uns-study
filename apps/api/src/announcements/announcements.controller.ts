import { Controller, Get, Inject, Param } from "@nestjs/common";
import { RoomsService } from "../rooms/rooms.service.js";
import { AnnouncementsService } from "./announcements.service.js";

/** Public, read-only: banner copy for the room page. */
@Controller("rooms")
export class RoomAnnouncementsController {
  constructor(
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(AnnouncementsService) private readonly announcements: AnnouncementsService,
  ) {}

  @Get(":idOrSlug/announcements")
  async list(@Param("idOrSlug") idOrSlug: string) {
    const room = await this.rooms.findRoomRow(idOrSlug);
    return this.announcements.listActive(room.id);
  }
}
