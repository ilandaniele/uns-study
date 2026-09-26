import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module.js";
import { CheckInsModule } from "../checkins/checkins.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { AnnouncementsModule } from "../announcements/announcements.module.js";
import { ModerationActionService } from "./moderation-action.service.js";
import { AdminReportsService } from "./admin-reports.service.js";
import { AdminUsersService } from "./admin-users.service.js";
import { AdminAuditService } from "./admin-audit.service.js";
import { AdminRoomsService } from "./admin-rooms.service.js";
import { AdminReportsController } from "./admin-reports.controller.js";
import { AdminUsersController } from "./admin-users.controller.js";
import { AdminAuditController } from "./admin-audit.controller.js";
import { AdminRoomsController } from "./admin-rooms.controller.js";
import { AdminAnnouncementsController } from "./admin-announcements.controller.js";

@Module({
  imports: [RoomsModule, CheckInsModule, StorageModule, AnnouncementsModule],
  controllers: [AdminReportsController, AdminUsersController, AdminAuditController, AdminRoomsController, AdminAnnouncementsController],
  providers: [ModerationActionService, AdminReportsService, AdminUsersService, AdminAuditService, AdminRoomsService],
})
export class AdminModule {}
