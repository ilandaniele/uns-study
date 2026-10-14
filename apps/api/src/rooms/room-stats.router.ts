import { Hono } from "hono";
import type { AppEnv } from "../http/context.js";
import { optionalAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";

/** Public (optional auth): visitor counting and the caller's daily contribution count. */
export const roomStatsRouter = new Hono<AppEnv>();

roomStatsRouter.post("/rooms/:idOrSlug/visits", optionalAuth, async (c) => {
  const { services, ip } = c.var;
  const user = c.get("user");
  await services.antiAbuse.enforceRateLimit({ key: `room-visit:${user?.id ?? ip}`, limit: 20, windowSeconds: 60 });
  await services.roomStats.recordVisit(c.req.param("idOrSlug"), { userId: user?.id ?? null, ip });
  return reply(c, null, 204);
});

roomStatsRouter.get("/rooms/:idOrSlug/stats/today", optionalAuth, async (c) => {
  // Personalised for signed-in callers, so never let a shared cache mix the two.
  c.header("Vary", "Cookie");
  c.header("Cache-Control", "private, no-cache");
  return reply(c, await c.var.services.roomStats.getToday(c.req.param("idOrSlug"), c.get("user")?.id ?? null));
});
