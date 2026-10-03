import { Body, Controller, Get, Inject, Param, Patch, Query, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { reportStatusSchema } from "@sala/contracts";
import { AdminGuard } from "../users/admin.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { AdminReportsService } from "./admin-reports.service.js";

@Controller("admin/reports")
@UseGuards(AdminGuard)
export class AdminReportsController {
  constructor(@Inject(AdminReportsService) private readonly reports: AdminReportsService) {}

  @Get()
  list(@Query("status") status?: string, @Query("cursor") cursor?: string) {
    return this.reports.list(status, cursor);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.reports.getById(id);
  }

  @Patch(":id")
  setStatus(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(reportStatusSchema)) body: z.infer<typeof reportStatusSchema>,
  ) {
    return this.reports.setStatus(id, body.status, user.id);
  }

  @Get(":id/attachments/:attachmentId/url")
  async getAttachmentUrl(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("attachmentId") attachmentId: string) {
    const url = await this.reports.getAttachmentUrl(id, attachmentId, user.id);
    return { url };
  }
}
