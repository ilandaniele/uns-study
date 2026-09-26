import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { RoomsModule } from "../rooms/rooms.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { ExpirationJob } from "./expiration.job.js";
import { DailyResetJob } from "./daily-reset.job.js";
import { AttachmentSweepJob } from "./attachment-sweep.job.js";

@Module({
  imports: [ScheduleModule.forRoot(), RoomsModule, StorageModule],
  providers: [ExpirationJob, DailyResetJob, AttachmentSweepJob],
  exports: [ExpirationJob, DailyResetJob, AttachmentSweepJob],
})
export class JobsModule {}
