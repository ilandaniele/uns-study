import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { schema } from "@sala/database";
import { ApiErrors } from "../common/api-error.js";
import { env } from "../env.js";
import type { AppEnv } from "./context.js";

/**
 * E2E-only: ages a user's ACTIVE check-in past `expires_at` and runs one expiration sweep, so a
 * spec can assert the post-expiry state without waiting 180 minutes. `env.e2eTestHooks` is forced
 * off in production, and the handler refuses to run without it.
 */
export const e2eTestHooksRouter = new Hono<AppEnv>();

e2eTestHooksRouter.post("/__e2e/expire-checkin", async (c) => {
  if (!env.e2eTestHooks) throw ApiErrors.forbidden("Forbidden");
  const { db, jobs } = c.var.services;
  const body = (await c.req.json().catch(() => null)) as { userId?: string } | null;
  if (!body?.userId) return c.json({ expired: false });
  const now = new Date();
  const aged = db
    .update(schema.checkIns)
    .set({ expiresAt: new Date(now.getTime() - 60_000) })
    .where(and(eq(schema.checkIns.userId, body.userId), eq(schema.checkIns.status, "ACTIVE")))
    .returning({ id: schema.checkIns.id })
    .all();
  await jobs.expiration.runSweep(new Date());
  return c.json({ expired: aged.length > 0 });
});
