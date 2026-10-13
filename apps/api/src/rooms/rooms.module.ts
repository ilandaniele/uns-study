import { Module } from "@nestjs/common";
import { RoomsController } from "./rooms.controller.js";
import { RoomsService } from "./rooms.service.js";
import { RoomStateService } from "./room-state.service.js";
import { RoomStatsController } from "./room-stats.controller.js";
import { RoomStatsService } from "./room-stats.service.js";

@Module({
  controllers: [RoomsController, RoomStatsController],
  providers: [RoomsService, RoomStateService, RoomStatsService],
  exports: [RoomsService, RoomStateService],
})
export class RoomsModule {}
