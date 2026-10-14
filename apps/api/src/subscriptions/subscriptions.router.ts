import { Hono } from "hono";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";

const LIMIT = 5;
const WINDOW_S = 3600;

/** `/subscriptions/*`: the authenticated user manages their own ad-free subscription. */
export const subscriptionsRouter = new Hono<AppEnv>();

async function checkLimit(rateLimit: AppEnv["Variables"]["services"]["rateLimit"], key: string): Promise<void> {
  const limit = await rateLimit.check(key, LIMIT, WINDOW_S);
  if (!limit.allowed) throw ApiErrors.rateLimited();
}

subscriptionsRouter.get("/subscriptions/me", requireAuth(), async (c) => reply(c, await c.var.services.subscriptions.getForUser(currentUser(c).id)));

subscriptionsRouter.post("/subscriptions/checkout", requireAuth(), async (c) => {
  const user = currentUser(c);
  await checkLimit(c.var.services.rateLimit, `subs:checkout:${user.id}`);
  return reply(c, await c.var.services.subscriptions.checkout(user), 201);
});

subscriptionsRouter.post("/subscriptions/cancel", requireAuth(), async (c) => {
  const user = currentUser(c);
  await checkLimit(c.var.services.rateLimit, `subs:cancel:${user.id}`);
  return reply(c, await c.var.services.subscriptions.cancel(user.id), 201);
});
