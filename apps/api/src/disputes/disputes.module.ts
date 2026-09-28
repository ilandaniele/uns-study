import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module.js";
import { PresenceModule } from "../presence/presence.module.js";
import { DisputeService } from "./disputes.service.js";
import { DisputesController } from "./disputes.controller.js";
import { DisputeReadsController, RoomDisputesController } from "./disputes-read.controller.js";

@Module({
  imports: [RoomsModule, PresenceModule],
  controllers: [DisputesController, DisputeReadsController, RoomDisputesController],
  providers: [DisputeService],
  exports: [DisputeService],
})
export class DisputesModule {}
