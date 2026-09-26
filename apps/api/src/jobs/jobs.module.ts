import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { RoomsModule } from "../rooms/rooms.module.js";
import { ExpirationJob } from "./expiration.job.js";
import { DailyResetJob } from "./daily-reset.job.js";

@Module({
  imports: [ScheduleModule.forRoot(), RoomsModule],
  providers: [ExpirationJob, DailyResetJob],
  exports: [ExpirationJob, DailyResetJob],
})
export class JobsModule {}
