import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { moderationActionSchema } from "@sala/contracts";
import { AdminGuard } from "../users/admin.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { AdminUsersService } from "./admin-users.service.js";

@Controller("admin/users")
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(@Inject(AdminUsersService) private readonly users: AdminUsersService) {}

  @Get()
  search(@Query("q") q?: string) {
    return this.users.search(q);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.users.getById(id);
  }

  @Post(":id/actions")
  async applyAction(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(moderationActionSchema)) body: z.infer<typeof moderationActionSchema>,
  ) {
    await this.users.applyAction(user.id, id, body);
    return { ok: true };
  }
}
