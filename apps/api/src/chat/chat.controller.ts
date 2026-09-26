import { Body, Controller, Delete, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { chatMessageSchema } from "@uns/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { ChatService } from "./chat.service.js";

@Controller()
@UseGuards(AuthGuard)
export class ChatController {
  constructor(
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
  ) {}

  @Get("rooms/:idOrSlug/messages")
  list(@CurrentUser() user: RequestUser, @Param("idOrSlug") idOrSlug: string, @Query("cursor") cursor?: string) {
    return this.chat.listMessages(idOrSlug, user.id, cursor ?? null);
  }

  @Post("rooms/:idOrSlug/messages")
  async create(
    @CurrentUser() user: RequestUser,
    @Param("idOrSlug") idOrSlug: string,
    @Body(new ZodBodyPipe(chatMessageSchema)) body: z.infer<typeof chatMessageSchema>,
  ) {
    const limit = await this.rateLimit.check(`chat:${user.id}`, 20, 60);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    const dto = await this.chat.createMessage(user.id, idOrSlug, body.content);
    this.realtime.emitChatMessage(dto.chatRoomId, dto);
    return dto;
  }

  @Delete("messages/:id")
  async remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const { chatRoomId } = await this.chat.deleteMessage(id, user.id);
    this.realtime.emitChatDeleted(chatRoomId, id);
    return { ok: true };
  }
}
