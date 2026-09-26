import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { studyStartSchema } from "@uns/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { StudyService } from "./study.service.js";

@Controller("study")
@UseGuards(AuthGuard)
export class StudyController {
  constructor(@Inject(StudyService) private readonly study: StudyService) {}

  @Post("start")
  async start(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(studyStartSchema)) body: z.infer<typeof studyStartSchema>,
  ) {
    return this.study.start(user.id, body.roomId, {
      subject: body.subject,
      message: body.message,
      lookingForGroup: body.lookingForGroup,
    });
  }

  @Post("stop")
  @HttpCode(200)
  async stop(@CurrentUser() user: RequestUser) {
    await this.study.stop(user.id);
    return { ok: true };
  }
}
