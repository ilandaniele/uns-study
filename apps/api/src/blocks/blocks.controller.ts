import { Controller, Delete, Get, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { BlocksService } from "./blocks.service.js";

/** Routes span two resource prefixes (`/users/:id/block`, `/me/blocks`) so this controller has no base path. */
@Controller()
@UseGuards(AuthGuard)
export class BlocksController {
  constructor(
    @Inject(BlocksService) private readonly blocks: BlocksService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  // Block and unblock share one bucket so toggling can't be used to dodge the cap.
  private async checkWriteLimit(userId: string): Promise<void> {
    const limit = await this.rateLimit.check(`block:${userId}`, 30, 3600);
    if (!limit.allowed) throw ApiErrors.rateLimited();
  }

  @Post("users/:userId/block")
  async block(@CurrentUser() user: RequestUser, @Param("userId") userId: string) {
    await this.checkWriteLimit(user.id);
    await this.blocks.block(user.id, userId);
    return { ok: true };
  }

  @Delete("users/:userId/block")
  @HttpCode(200)
  async unblock(@CurrentUser() user: RequestUser, @Param("userId") userId: string) {
    await this.checkWriteLimit(user.id);
    await this.blocks.unblock(user.id, userId);
    return { ok: true };
  }

  @Get("me/blocks")
  list(@CurrentUser() user: RequestUser) {
    return this.blocks.listBlocks(user.id);
  }
}
