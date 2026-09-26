import { Module } from "@nestjs/common";
import { PresenceService } from "./presence.service.js";
import { PresenceController } from "./presence.controller.js";
import { RoomsModule } from "../rooms/rooms.module.js";

@Module({
  imports: [RoomsModule],
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
