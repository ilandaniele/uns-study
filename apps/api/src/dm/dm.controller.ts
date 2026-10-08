import { Body, Controller, Get, HttpCode, Inject, Logger, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { createConversationSchema, dmSendSchema } from "@sala/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { runInBackground } from "../common/background.js";
import { NotificationService } from "../notifications/notification.service.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { DmService } from "./dm.service.js";
import { UuidParamPipe } from "../common/uuid-param.pipe.js";

@Controller("conversations")
@UseGuards(AuthGuard)
export class DmController {
  private readonly logger = new Logger(DmController.name);

  constructor(
    @Inject(DmService) private readonly dm: DmService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.dm.listConversations(user.id);
  }

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(createConversationSchema)) body: z.infer<typeof createConversationSchema>,
  ) {
    const limit = await this.rateLimit.check(`dm-create:${user.id}`, 10, 3600);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    return this.dm.getOrCreateConversation(user.id, body.userId);
  }

  @Get(":id/messages")
  listMessages(@CurrentUser() user: RequestUser, @Param("id", UuidParamPipe) id: string, @Query("cursor") cursor?: string) {
    return this.dm.listMessages(id, user.id, cursor ?? null);
  }

  @Post(":id/messages")
  async sendMessage(
    @CurrentUser() user: RequestUser,
    @Param("id", UuidParamPipe) id: string,
    @Body(new ZodBodyPipe(dmSendSchema)) body: z.infer<typeof dmSendSchema>,
  ) {
    const limit = await this.rateLimit.check(`dm:${user.id}`, 15, 60);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    const dto = await this.dm.sendMessage(id, user.id, body.content);
    const otherId = await this.dm.otherParticipant(id, user.id);
    this.realtime.emitDm([user.id, otherId], dto);
    if (dto.content) {
      const content = dto.content;
      runInBackground(this.logger, "dm push", async () =>
        this.notifications.notifyDirectMessage({
          recipientId: otherId,
          senderDisplayName: await this.dm.publicDisplayName(user.id),
          conversationId: id,
          content,
        }),
      );
    }
    return dto;
  }

  @Post(":id/read")
  @HttpCode(200)
  async markRead(@CurrentUser() user: RequestUser, @Param("id", UuidParamPipe) id: string) {
    const limit = await this.rateLimit.check(`dm-read:${user.id}`, 60, 60);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    await this.dm.markRead(id, user.id);
    return { ok: true };
  }
}
