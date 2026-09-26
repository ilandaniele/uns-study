import { Global, Module } from "@nestjs/common";
import { RoomRealtimeGateway } from "./room-realtime.gateway.js";
import { RealtimeTokenController } from "./realtime-token.controller.js";
import { RoomsModule } from "../rooms/rooms.module.js";
import { AuthModule } from "../auth/auth.module.js";

@Global()
@Module({
  imports: [RoomsModule, AuthModule],
  controllers: [RealtimeTokenController],
  providers: [RoomRealtimeGateway],
  exports: [RoomRealtimeGateway],
})
export class RealtimeModule {}
