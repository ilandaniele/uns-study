import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module.js";
import { BlocksModule } from "../blocks/blocks.module.js";
import { ChatController } from "./chat.controller.js";
import { ChatService } from "./chat.service.js";

@Module({
  imports: [RoomsModule, BlocksModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
