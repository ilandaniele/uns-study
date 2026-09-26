import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module.js";
import { AnnouncementsService } from "./announcements.service.js";
import { RoomAnnouncementsController } from "./announcements.controller.js";

@Module({
  imports: [RoomsModule],
  controllers: [RoomAnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
