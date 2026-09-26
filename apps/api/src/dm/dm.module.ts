import { Module } from "@nestjs/common";
import { BlocksModule } from "../blocks/blocks.module.js";
import { DmController } from "./dm.controller.js";
import { DmService } from "./dm.service.js";

@Module({
  imports: [BlocksModule],
  controllers: [DmController],
  providers: [DmService],
  exports: [DmService],
})
export class DmModule {}
