import { Module } from "@nestjs/common";
import { AvatarsService } from "./avatars.service.js";
import { ProfileAvatarController, PublicAvatarController } from "./avatars.controller.js";

@Module({
  controllers: [ProfileAvatarController, PublicAvatarController],
  providers: [AvatarsService],
  exports: [AvatarsService],
})
export class AvatarsModule {}
