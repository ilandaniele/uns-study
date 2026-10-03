import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { studyStartSchema } from "@sala/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { StudyService } from "./study.service.js";

@Controller("study")
@UseGuards(AuthGuard)
export class StudyController {
  constructor(
    @Inject(StudyService) private readonly study: StudyService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  // Start and stop share one bucket.
  private async checkWriteLimit(userId: string): Promise<void> {
    const limit = await this.rateLimit.check(`study:${userId}`, 60, 3600);
    if (!limit.allowed) throw ApiErrors.rateLimited();
  }

  @Post("start")
  async start(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(studyStartSchema)) body: z.infer<typeof studyStartSchema>,
  ) {
    await this.checkWriteLimit(user.id);
    return this.study.start(user.id, body.roomId, {
      subject: body.subject,
      message: body.message,
      lookingForGroup: body.lookingForGroup,
    });
  }

  @Post("stop")
  @HttpCode(200)
  async stop(@CurrentUser() user: RequestUser) {
    await this.checkWriteLimit(user.id);
    await this.study.stop(user.id);
    return { ok: true };
  }
}
