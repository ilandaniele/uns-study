import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { RoomsModule } from "../rooms/rooms.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { DisputesModule } from "../disputes/disputes.module.js";
import { ExpirationJob } from "./expiration.job.js";
import { DailyResetJob } from "./daily-reset.job.js";
import { AttachmentSweepJob } from "./attachment-sweep.job.js";
import { DisputeResolutionJob } from "./dispute-resolution.job.js";

@Module({
  imports: [ScheduleModule.forRoot(), RoomsModule, StorageModule, DisputesModule],
  providers: [ExpirationJob, DailyResetJob, AttachmentSweepJob, DisputeResolutionJob],
  exports: [ExpirationJob, DailyResetJob, AttachmentSweepJob, DisputeResolutionJob],
})
export class JobsModule {}
