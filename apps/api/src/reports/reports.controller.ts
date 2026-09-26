import { Body, Controller, Inject, Param, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { attachmentRequestSchema, createReportSchema } from "@uns/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ReportsService } from "./reports.service.js";

@Controller()
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Post("users/:userId/reports")
  create(
    @CurrentUser() user: RequestUser,
    @Param("userId") reportedUserId: string,
    @Body(new ZodBodyPipe(createReportSchema)) body: z.infer<typeof createReportSchema>,
  ) {
    return this.reports.createReport({ reporterId: user.id, reportedUserId, ...body });
  }

  @Post("reports/:id/attachments")
  requestAttachment(
    @CurrentUser() user: RequestUser,
    @Param("id") reportId: string,
    @Body(new ZodBodyPipe(attachmentRequestSchema)) body: z.infer<typeof attachmentRequestSchema>,
  ) {
    return this.reports.requestAttachment(reportId, user.id, body.contentType, body.sizeBytes);
  }

  @Post("reports/:id/attachments/:attachmentId/complete")
  async completeAttachment(@CurrentUser() user: RequestUser, @Param("id") reportId: string, @Param("attachmentId") attachmentId: string) {
    await this.reports.completeAttachment(reportId, attachmentId, user.id);
    return { ok: true };
  }
}
