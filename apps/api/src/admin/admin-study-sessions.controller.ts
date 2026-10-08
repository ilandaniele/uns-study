import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { manualStudySessionSchema } from "@sala/contracts";
import { AdminOnlyGuard } from "../users/admin.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { AdminStudySessionsService } from "./admin-study-sessions.service.js";

@Controller("admin/study-sessions")
@UseGuards(AdminOnlyGuard)
export class AdminStudySessionsController {
  constructor(@Inject(AdminStudySessionsService) private readonly studySessions: AdminStudySessionsService) {}

  /** Credits study time a user really did but that was never recorded (see `AdminStudySessionsService`). */
  @Post()
  credit(@CurrentUser() user: RequestUser, @Body(new ZodBodyPipe(manualStudySessionSchema)) body: z.infer<typeof manualStudySessionSchema>) {
    return this.studySessions.credit(user.id, body);
  }
}
