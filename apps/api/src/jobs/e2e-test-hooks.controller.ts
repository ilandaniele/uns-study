import { Body, Controller, ForbiddenException, HttpCode, Inject, Post } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { DB } from "../database/database.module.js";
import { env } from "../env.js";
import { ExpirationJob } from "./expiration.job.js";

/**
 * E2E-only: ages a user's ACTIVE check-in past `expires_at` and runs one expiration sweep, so a
 * spec can assert the post-expiry state without waiting 180 minutes. Only mounted when
 * `env.e2eTestHooks` (never in production — see `JobsModule`); the guard below is defence in depth.
 */
@Controller("__e2e")
export class E2eTestHooksController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ExpirationJob) private readonly expiration: ExpirationJob,
  ) {}

  @Post("expire-checkin")
  @HttpCode(200)
  async expireCheckIn(@Body() body: { userId?: string }): Promise<{ expired: boolean }> {
    if (!env.e2eTestHooks) throw new ForbiddenException();
    if (!body?.userId) return { expired: false };
    const now = new Date();
    const aged = await this.db
      .update(schema.checkIns)
      .set({ expiresAt: new Date(now.getTime() - 60_000) })
      .where(and(eq(schema.checkIns.userId, body.userId), eq(schema.checkIns.status, "ACTIVE")))
      .returning({ id: schema.checkIns.id });
    await this.expiration.runSweep(new Date());
    return { expired: aged.length > 0 };
  }
}
