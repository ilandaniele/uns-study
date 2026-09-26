import { Controller, Delete, Get, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { BlocksService } from "./blocks.service.js";

/** Routes span two resource prefixes (`/users/:id/block`, `/me/blocks`) so this controller has no base path. */
@Controller()
@UseGuards(AuthGuard)
export class BlocksController {
  constructor(@Inject(BlocksService) private readonly blocks: BlocksService) {}

  @Post("users/:userId/block")
  async block(@CurrentUser() user: RequestUser, @Param("userId") userId: string) {
    await this.blocks.block(user.id, userId);
    return { ok: true };
  }

  @Delete("users/:userId/block")
  @HttpCode(200)
  async unblock(@CurrentUser() user: RequestUser, @Param("userId") userId: string) {
    await this.blocks.unblock(user.id, userId);
    return { ok: true };
  }

  @Get("me/blocks")
  list(@CurrentUser() user: RequestUser) {
    return this.blocks.listBlocks(user.id);
  }
}
