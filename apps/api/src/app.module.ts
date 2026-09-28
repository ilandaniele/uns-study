import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { SecurityModule } from "./security/security.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { RoomsModule } from "./rooms/rooms.module.js";
import { PresenceModule } from "./presence/presence.module.js";
import { CheckInsModule } from "./checkins/checkins.module.js";
import { ObservationsModule } from "./observations/observations.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { HealthController } from "./health.controller.js";
import { AuthProvidersController } from "./auth-providers.controller.js";
import { UsersModule } from "./users/users.module.js";
import { ProfilesModule } from "./profiles/profiles.module.js";
import { StudyModule } from "./study/study.module.js";
import { ChatModule } from "./chat/chat.module.js";
import { DmModule } from "./dm/dm.module.js";
import { BlocksModule } from "./blocks/blocks.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { StorageModule } from "./storage/storage.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { AnnouncementsModule } from "./announcements/announcements.module.js";
import { RankingsModule } from "./rankings/rankings.module.js";
import { QrModule } from "./qr/qr.module.js";
import { ReputationModule } from "./reputation/reputation.module.js";
import { DisputesModule } from "./disputes/disputes.module.js";
import { VerificationModule } from "./verification/verification.module.js";
import { AvatarsModule } from "./avatars/avatars.module.js";
import { TableNamesModule } from "./table-names/table-names.module.js";

@Module({
  imports: [
    DatabaseModule,
    SecurityModule,
    UsersModule,
    ReputationModule,
    RealtimeModule,
    RoomsModule,
    AuthModule,
    PresenceModule,
    CheckInsModule,
    ObservationsModule,
    DisputesModule,
    BlocksModule,
    StorageModule,
    StudyModule,
    ProfilesModule,
    ChatModule,
    DmModule,
    AnnouncementsModule,
    ReportsModule,
    AdminModule,
    RankingsModule,
    QrModule,
    VerificationModule,
    AvatarsModule,
    TableNamesModule,
    JobsModule,
  ],
  controllers: [HealthController, AuthProvidersController],
})
export class AppModule {}
