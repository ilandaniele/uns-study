import { Global, Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module.js";
import { StudySessionService } from "./study-session.service.js";
import { RankingsService } from "./rankings.service.js";
import { RankingsController } from "./rankings.controller.js";

@Global()
@Module({
  imports: [RoomsModule],
  controllers: [RankingsController],
  providers: [StudySessionService, RankingsService],
  exports: [StudySessionService],
})
export class RankingsModule {}
