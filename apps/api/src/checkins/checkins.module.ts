import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module.js";
import { PresenceModule } from "../presence/presence.module.js";
import { DisputesModule } from "../disputes/disputes.module.js";
import { CheckInService } from "./checkins.service.js";
import { CheckInsController } from "./checkins.controller.js";

@Module({
  imports: [RoomsModule, PresenceModule, DisputesModule],
  controllers: [CheckInsController],
  providers: [CheckInService],
  exports: [CheckInService],
})
export class CheckInsModule {}
