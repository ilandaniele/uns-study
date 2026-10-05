import { Body, Controller, Inject, Param, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { attachmentRequestSchema, createReportSchema } from "@sala/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { ReportsService } from "./reports.service.js";
import { UuidParamPipe } from "../common/uuid-param.pipe.js";

@Controller()
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  @Post("users/:userId/reports")
  create(
    @CurrentUser() user: RequestUser,
    @Param("userId") reportedUserId: string,
    @Body(new ZodBodyPipe(createReportSchema)) body: z.infer<typeof createReportSchema>,
  ) {
    return this.reports.createReport({ reporterId: user.id, reportedUserId, ...body });
  }

  @Post("reports/:id/attachments")
  async requestAttachment(
    @CurrentUser() user: RequestUser,
    @Param("id", UuidParamPipe) reportId: string,
    @Body(new ZodBodyPipe(attachmentRequestSchema)) body: z.infer<typeof attachmentRequestSchema>,
  ) {
    const limit = await this.rateLimit.check(`report-attachment:${user.id}`, 10, 3600);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    return this.reports.requestAttachment(reportId, user.id, body.contentType, body.sizeBytes);
  }

  @Post("reports/:id/attachments/:attachmentId/complete")
  async completeAttachment(@CurrentUser() user: RequestUser, @Param("id", UuidParamPipe) reportId: string, @Param("attachmentId", UuidParamPipe) attachmentId: string) {
    const limit = await this.rateLimit.check(`report-attachment-complete:${user.id}`, 10, 3600);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    await this.reports.completeAttachment(reportId, attachmentId, user.id);
    return { ok: true };
  }
}
