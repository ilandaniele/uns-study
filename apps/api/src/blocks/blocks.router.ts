import { Hono } from "hono";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";

/** Routes span two resource prefixes (`/users/:userId/block`, `/me/blocks`), so paths are written in full. */
export const blocksRouter = new Hono<AppEnv>();

// Block and unblock share one bucket so toggling can't be used to dodge the cap.
async function checkWriteLimit(rateLimit: { check(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean }> }, userId: string): Promise<void> {
  const limit = await rateLimit.check(`block:${userId}`, 30, 3600);
  if (!limit.allowed) throw ApiErrors.rateLimited();
}

blocksRouter.post("/users/:userId/block", requireAuth(), async (c) => {
  const user = currentUser(c);
  await checkWriteLimit(c.var.services.rateLimit, user.id);
  await c.var.services.blocks.block(user.id, c.req.param("userId"));
  return reply(c, { ok: true }, 201);
});

blocksRouter.delete("/users/:userId/block", requireAuth(), async (c) => {
  const user = currentUser(c);
  await checkWriteLimit(c.var.services.rateLimit, user.id);
  await c.var.services.blocks.unblock(user.id, c.req.param("userId"));
  return reply(c, { ok: true });
});

blocksRouter.get("/me/blocks", requireAuth(), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.blocks.listBlocks(user.id));
});
