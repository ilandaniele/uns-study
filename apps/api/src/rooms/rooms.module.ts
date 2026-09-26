import { Module } from "@nestjs/common";
import { RoomsController } from "./rooms.controller.js";
import { RoomsService } from "./rooms.service.js";
import { RoomStateService } from "./room-state.service.js";

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomStateService],
  exports: [RoomsService, RoomStateService],
})
export class RoomsModule {}
