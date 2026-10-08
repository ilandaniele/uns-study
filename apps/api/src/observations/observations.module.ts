import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module.js";
import { PresenceModule } from "../presence/presence.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ObservationService } from "./observations.service.js";
import { ObservationsController } from "./observations.controller.js";

@Module({
  imports: [RoomsModule, PresenceModule, NotificationsModule],
  controllers: [ObservationsController],
  providers: [ObservationService],
  exports: [ObservationService],
})
export class ObservationsModule {}
