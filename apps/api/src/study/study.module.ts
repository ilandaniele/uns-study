import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module.js";
import { StudyService } from "./study.service.js";
import { StudyController } from "./study.controller.js";
import { RoomPeopleService } from "./room-people.service.js";
import { RoomPeopleController } from "./room-people.controller.js";

@Module({
  // AliasService comes from the @Global() UsersModule.
  imports: [RoomsModule],
  controllers: [StudyController, RoomPeopleController],
  providers: [StudyService, RoomPeopleService],
  exports: [StudyService, RoomPeopleService],
})
export class StudyModule {}
