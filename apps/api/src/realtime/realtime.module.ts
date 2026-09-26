import { Global, Module } from "@nestjs/common";
import { RoomRealtimeGateway } from "./room-realtime.gateway.js";
import { RoomsModule } from "../rooms/rooms.module.js";
import { AuthModule } from "../auth/auth.module.js";

@Global()
@Module({
  imports: [RoomsModule, AuthModule],
  providers: [RoomRealtimeGateway],
  exports: [RoomRealtimeGateway],
})
export class RealtimeModule {}
