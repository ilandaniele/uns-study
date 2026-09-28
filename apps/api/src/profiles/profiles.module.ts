import { Module } from "@nestjs/common";
import { CheckInsModule } from "../checkins/checkins.module.js";
import { StudyModule } from "../study/study.module.js";
import { ProfilesService } from "./profiles.service.js";
import { ProfilesController } from "./profiles.controller.js";
import { CheckInIdentityController } from "./checkin-identity.controller.js";
import { AccountController } from "./account.controller.js";

@Module({
  // AliasService comes from the @Global() UsersModule.
  imports: [CheckInsModule, StudyModule],
  controllers: [ProfilesController, CheckInIdentityController, AccountController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
