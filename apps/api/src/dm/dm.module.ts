import { Module } from "@nestjs/common";
import { BlocksModule } from "../blocks/blocks.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { DmController } from "./dm.controller.js";
import { DmService } from "./dm.service.js";

@Module({
  imports: [BlocksModule, NotificationsModule],
  controllers: [DmController],
  providers: [DmService],
  exports: [DmService],
})
export class DmModule {}
