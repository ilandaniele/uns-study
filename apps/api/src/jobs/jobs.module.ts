import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { RoomsModule } from "../rooms/rooms.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { DisputesModule } from "../disputes/disputes.module.js";
import { ExpirationJob } from "./expiration.job.js";
import { DailyResetJob } from "./daily-reset.job.js";
import { AttachmentSweepJob } from "./attachment-sweep.job.js";
import { CheckInExpiryReminderJob } from "./checkin-expiry-reminder.job.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { env } from "../env.js";
import { E2eTestHooksController } from "./e2e-test-hooks.controller.js";
import { DisputeResolutionJob } from "./dispute-resolution.job.js";

@Module({
  imports: [ScheduleModule.forRoot(), RoomsModule, StorageModule, DisputesModule, NotificationsModule],
  // Only mounted when E2E_TEST_HOOKS=true outside production (see `env.ts`).
  controllers: env.e2eTestHooks ? [E2eTestHooksController] : [],
  providers: [ExpirationJob, DailyResetJob, AttachmentSweepJob, DisputeResolutionJob, CheckInExpiryReminderJob],
  exports: [ExpirationJob, DailyResetJob, AttachmentSweepJob, DisputeResolutionJob, CheckInExpiryReminderJob],
})
export class JobsModule {}
