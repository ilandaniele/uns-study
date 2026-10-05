import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { announcementSchema, SocketEvents, type AnnouncementDto } from "@sala/contracts";
import { AdminGuard, AdminOnlyGuard } from "../users/admin.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { AnnouncementsService } from "../announcements/announcements.service.js";
import { UuidParamPipe } from "../common/uuid-param.pipe.js";

/** Listing is available to MODERATOR too; writes (create/update/delete) are role-sensitive and ADMIN only. */
@Controller("admin/announcements")
@UseGuards(AdminGuard)
export class AdminAnnouncementsController {
  constructor(
    @Inject(AnnouncementsService) private readonly announcements: AnnouncementsService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
  ) {}

  @Get()
  async list() {
    return this.announcements.listAll();
  }

  @Post()
  @UseGuards(AdminOnlyGuard)
  async create(@CurrentUser() user: RequestUser, @Body(new ZodBodyPipe(announcementSchema)) body: z.infer<typeof announcementSchema>) {
    const created = await this.announcements.create(body, user.id);
    this.emitChanged(created);
    return created;
  }

  @Patch(":id")
  @UseGuards(AdminOnlyGuard)
  async update(@Param("id", UuidParamPipe) id: string, @Body(new ZodBodyPipe(announcementSchema.partial())) body: Partial<z.infer<typeof announcementSchema>>) {
    const updated = await this.announcements.update(id, body);
    this.emitChanged(updated);
    return updated;
  }

  @Delete(":id")
  @UseGuards(AdminOnlyGuard)
  async remove(@Param("id", UuidParamPipe) id: string) {
    const roomId = await this.announcements.remove(id);
    this.emitToRoom(roomId, { id, removed: true });
    return { ok: true };
  }

  private emitChanged(dto: AnnouncementDto): void {
    this.emitToRoom(dto.roomId, dto);
  }

  private emitToRoom(roomId: string | null, payload: unknown): void {
    if (roomId) {
      this.realtime.server?.to(`room:${roomId}`).emit(SocketEvents.AnnouncementChanged, payload);
    } else {
      this.realtime.server?.emit(SocketEvents.AnnouncementChanged, payload);
    }
  }
}
