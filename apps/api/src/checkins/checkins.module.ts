import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module.js";
import { PresenceModule } from "../presence/presence.module.js";
import { DisputesModule } from "../disputes/disputes.module.js";
import { VerificationModule } from "../verification/verification.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { CheckInService } from "./checkins.service.js";
import { PhotoVerificationService } from "./photo-verification.service.js";
import { CheckInsController } from "./checkins.controller.js";

@Module({
  imports: [RoomsModule, PresenceModule, DisputesModule, VerificationModule, NotificationsModule],
  controllers: [CheckInsController],
  providers: [CheckInService, PhotoVerificationService],
  exports: [CheckInService],
})
export class CheckInsModule {}
