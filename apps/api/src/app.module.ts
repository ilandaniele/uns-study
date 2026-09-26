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

@Module({
  imports: [
    DatabaseModule,
    SecurityModule,
    RealtimeModule,
    RoomsModule,
    AuthModule,
    PresenceModule,
    CheckInsModule,
    ObservationsModule,
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
