import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { UsersModule } from "../users/users.module.js";
import { TableNamesService } from "./table-names.service.js";
import { TableNamesReadController, TableNameVotesController } from "./table-names.controller.js";

@Module({
  imports: [RealtimeModule, UsersModule],
  controllers: [TableNamesReadController, TableNameVotesController],
  providers: [TableNamesService],
  exports: [TableNamesService],
})
export class TableNamesModule {}
