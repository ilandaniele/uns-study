import { Global, Module } from "@nestjs/common";
import { RoomCache } from "./room-cache.service.js";

@Global()
@Module({
  providers: [RoomCache],
  exports: [RoomCache],
})
export class CacheModule {}
