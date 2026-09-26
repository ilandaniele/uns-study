import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { AdminOnlyGuard } from "../users/admin.guard.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { QrService } from "./qr.service.js";

/** Admin CRUD for a room's QR codes — role-sensitive, ADMIN only. */
@Controller("admin/rooms/:idOrSlug/qr")
@UseGuards(AdminOnlyGuard)
export class AdminQrController {
  constructor(
    @Inject(QrService) private readonly qr: QrService,
    @Inject(RoomsService) private readonly rooms: RoomsService,
  ) {}

  @Post()
  async create(@Param("idOrSlug") idOrSlug: string, @Body() body: { tableCode?: unknown }) {
    const room = await this.rooms.findRoomRow(idOrSlug);
    const tableCode = typeof body?.tableCode === "string" && body.tableCode.trim() ? body.tableCode.trim().slice(0, 50) : null;
    return this.qr.create(room.id, tableCode);
  }

  @Get()
  async list(@Param("idOrSlug") idOrSlug: string) {
    const room = await this.rooms.findRoomRow(idOrSlug);
    return this.qr.list(room.id);
  }

  @Delete(":id")
  @HttpCode(200)
  async deactivate(@Param("idOrSlug") idOrSlug: string, @Param("id") id: string) {
    const room = await this.rooms.findRoomRow(idOrSlug);
    await this.qr.deactivate(room.id, id);
    return { ok: true };
  }
}

/** Public resolve used by the `/q/[token]` redirect page. */
@Controller("qr")
export class QrResolveController {
  constructor(@Inject(QrService) private readonly qr: QrService) {}

  @Get(":token")
  resolve(@Param("token") token: string) {
    return this.qr.resolve(token);
  }
}
