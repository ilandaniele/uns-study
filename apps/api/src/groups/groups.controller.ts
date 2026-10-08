import { Body, Controller, Get, HttpCode, Inject, Logger, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { addGroupMembersSchema, createGroupSchema, groupSendSchema } from "@sala/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { runInBackground } from "../common/background.js";
import { NotificationService } from "../notifications/notification.service.js";
import { UuidParamPipe } from "../common/uuid-param.pipe.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { GroupsService } from "./groups.service.js";

@Controller("groups")
@UseGuards(AuthGuard)
export class GroupsController {
  private readonly logger = new Logger(GroupsController.name);

  constructor(
    @Inject(GroupsService) private readonly groups: GroupsService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  private async limit(key: string, max: number, windowSec: number): Promise<void> {
    const result = await this.rateLimit.check(key, max, windowSec);
    if (!result.allowed) throw ApiErrors.rateLimited();
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.groups.listGroups(user.id);
  }

  // Must stay above `:id` so "contacts" is not parsed as a group id.
  @Get("contacts")
  contacts(@CurrentUser() user: RequestUser) {
    return this.groups.listContacts(user.id);
  }

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(createGroupSchema)) body: z.infer<typeof createGroupSchema>,
  ) {
    await this.limit(`group-create:${user.id}`, 10, 3600);

    const { group, memberIds } = await this.groups.createGroup(user.id, body);
    this.realtime.emitGroupUpdated(memberIds, { groupId: group.id });
    return group;
  }

  @Get(":id")
  get(@CurrentUser() user: RequestUser, @Param("id", UuidParamPipe) id: string) {
    return this.groups.getGroup(id, user.id);
  }

  @Post(":id/members")
  @HttpCode(200)
  async addMembers(
    @CurrentUser() user: RequestUser,
    @Param("id", UuidParamPipe) id: string,
    @Body(new ZodBodyPipe(addGroupMembersSchema)) body: z.infer<typeof addGroupMembersSchema>,
  ) {
    await this.limit(`group-members:${user.id}`, 30, 3600);

    const { group, memberIds } = await this.groups.addMembers(id, user.id, body.userIds);
    this.realtime.emitGroupUpdated(memberIds, { groupId: id });
    return group;
  }

  @Post(":id/leave")
  @HttpCode(200)
  async leave(@CurrentUser() user: RequestUser, @Param("id", UuidParamPipe) id: string) {
    await this.limit(`group-leave:${user.id}`, 30, 3600);

    const { remainingMemberIds } = await this.groups.leaveGroup(id, user.id);
    this.realtime.emitGroupUpdated([...remainingMemberIds, user.id], { groupId: id });
    return { ok: true };
  }

  @Get(":id/messages")
  listMessages(@CurrentUser() user: RequestUser, @Param("id", UuidParamPipe) id: string, @Query("cursor") cursor?: string) {
    return this.groups.listMessages(id, user.id, cursor ?? null);
  }

  @Post(":id/messages")
  async sendMessage(
    @CurrentUser() user: RequestUser,
    @Param("id", UuidParamPipe) id: string,
    @Body(new ZodBodyPipe(groupSendSchema)) body: z.infer<typeof groupSendSchema>,
  ) {
    await this.limit(`group:${user.id}`, 15, 60);

    const { message, memberIds } = await this.groups.sendMessage(id, user.id, body.content);
    this.realtime.emitGroupMessage(memberIds, message);
    if (message.content) {
      const content = message.content;
      runInBackground(this.logger, "group message push", async () => {
        await Promise.all(
          memberIds
            .filter((memberId) => memberId !== user.id)
            .map((recipientId) =>
              this.notifications.notifyDirectMessage({
                recipientId,
                senderDisplayName: message.senderName,
                conversationId: `group-${id}`,
                content,
                url: "/chat",
              }),
            ),
        );
      });
    }
    return message;
  }

  @Post(":id/read")
  @HttpCode(200)
  async markRead(@CurrentUser() user: RequestUser, @Param("id", UuidParamPipe) id: string) {
    await this.limit(`group-read:${user.id}`, 60, 60);

    await this.groups.markRead(id, user.id);
    return { ok: true };
  }
}
