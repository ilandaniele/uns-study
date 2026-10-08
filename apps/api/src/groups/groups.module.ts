import { Module } from "@nestjs/common";
import { BlocksModule } from "../blocks/blocks.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { GroupsController } from "./groups.controller.js";
import { GroupsService } from "./groups.service.js";

@Module({
  imports: [BlocksModule, NotificationsModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
