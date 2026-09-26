import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module.js";
import { ReportsService } from "./reports.service.js";
import { ReportsController } from "./reports.controller.js";

@Module({
  imports: [StorageModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
