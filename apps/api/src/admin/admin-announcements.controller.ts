import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { announcementSchema, SocketEvents, type AnnouncementDto } from "@uns/contracts";
import { AdminGuard } from "../users/admin.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { AnnouncementsService } from "../announcements/announcements.service.js";

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
  async create(@CurrentUser() user: RequestUser, @Body(new ZodBodyPipe(announcementSchema)) body: z.infer<typeof announcementSchema>) {
    const created = await this.announcements.create(body, user.id);
    this.emitChanged(created);
    return created;
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body(new ZodBodyPipe(announcementSchema.partial())) body: Partial<z.infer<typeof announcementSchema>>) {
    const updated = await this.announcements.update(id, body);
    this.emitChanged(updated);
    return updated;
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
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
