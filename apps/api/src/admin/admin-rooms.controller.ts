import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../users/admin.guard.js";
import { AdminRoomsService } from "./admin-rooms.service.js";

@Controller("admin/rooms")
@UseGuards(AdminGuard)
export class AdminRoomsController {
  constructor(@Inject(AdminRoomsService) private readonly rooms: AdminRoomsService) {}

  @Get(":idOrSlug/live")
  live(@Param("idOrSlug") idOrSlug: string) {
    return this.rooms.live(idOrSlug);
  }

  @Get(":idOrSlug/stats")
  stats(@Param("idOrSlug") idOrSlug: string) {
    return this.rooms.stats(idOrSlug);
  }
}
