import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module.js";
import { PresenceModule } from "../presence/presence.module.js";
import { CheckInsModule } from "../checkins/checkins.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { AnnouncementsModule } from "../announcements/announcements.module.js";
import { ModerationActionService } from "./moderation-action.service.js";
import { AdminReportsService } from "./admin-reports.service.js";
import { AdminUsersService } from "./admin-users.service.js";
import { AdminAuditService } from "./admin-audit.service.js";
import { AdminRoomsService } from "./admin-rooms.service.js";
import { AdminStudySessionsService } from "./admin-study-sessions.service.js";
import { AdminReportsController } from "./admin-reports.controller.js";
import { AdminUsersController } from "./admin-users.controller.js";
import { AdminAuditController } from "./admin-audit.controller.js";
import { AdminRoomsController } from "./admin-rooms.controller.js";
import { AdminAnnouncementsController } from "./admin-announcements.controller.js";
import { AdminNamesController } from "./admin-names.controller.js";
import { AdminStudySessionsController } from "./admin-study-sessions.controller.js";
import { TableNamesModule } from "../table-names/table-names.module.js";

@Module({
  imports: [RoomsModule, PresenceModule, CheckInsModule, StorageModule, AnnouncementsModule, TableNamesModule],
  controllers: [AdminReportsController, AdminUsersController, AdminAuditController, AdminRoomsController, AdminAnnouncementsController, AdminNamesController, AdminStudySessionsController],
  providers: [ModerationActionService, AdminReportsService, AdminUsersService, AdminAuditService, AdminRoomsService, AdminStudySessionsService],
})
export class AdminModule {}
