import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import type { z } from "zod";
import { proposeTableNameSchema } from "@uns/contracts";
import { AuthGuard, OptionalAuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { UuidParamPipe } from "../common/uuid-param.pipe.js";
import { ApiErrors } from "../common/api-error.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { TableNamesService } from "./table-names.service.js";

/** Public read (personalized with `myVote`/`mine` when a session is present); proposing requires auth. */
@Controller("tables/:tableId/names")
@UseGuards(OptionalAuthGuard)
export class TableNamesReadController {
  constructor(
    @Inject(TableNamesService) private readonly tableNames: TableNamesService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  list(@Param("tableId", UuidParamPipe) tableId: string, @CurrentUser() user: RequestUser | undefined) {
    return this.tableNames.listForTable(tableId, user?.id ?? null);
  }

  @Post()
  @UseGuards(AuthGuard)
  async propose(
    @Param("tableId", UuidParamPipe) tableId: string,
    @CurrentUser() user: RequestUser,
    @Body(new ZodBodyPipe(proposeTableNameSchema)) body: z.infer<typeof proposeTableNameSchema>,
  ) {
    const limit = await this.rateLimit.check(`table-name:propose:${user.id}`, 5, 3600);
    if (!limit.allowed) throw ApiErrors.rateLimited();
    return this.tableNames.propose(tableId, user.id, body.name);
  }
}

/** Voting on an existing proposal — every action here requires an authenticated session. */
@Controller("names/:proposalId/vote")
@UseGuards(AuthGuard)
export class TableNameVotesController {
  constructor(
    @Inject(TableNamesService) private readonly tableNames: TableNamesService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  async vote(@Param("proposalId", UuidParamPipe) proposalId: string, @CurrentUser() user: RequestUser) {
    const limit = await this.rateLimit.check(`table-name:vote:${user.id}`, 30, 600);
    if (!limit.allowed) throw ApiErrors.rateLimited();
    return this.tableNames.vote(proposalId, user.id);
  }

  @Delete()
  async unvote(@Param("proposalId", UuidParamPipe) proposalId: string, @CurrentUser() user: RequestUser) {
    const limit = await this.rateLimit.check(`table-name:vote:${user.id}`, 30, 600);
    if (!limit.allowed) throw ApiErrors.rateLimited();
    return this.tableNames.removeVote(proposalId, user.id);
  }
}
