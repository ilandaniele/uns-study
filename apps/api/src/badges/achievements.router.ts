import { Hono, type MiddlewareHandler } from "hono";
import { reviewAdminApplicationSchema, seenAchievementsSchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth, requireSuperAdmin } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";
import { ApiErrors } from "../common/api-error.js";

export const achievementsRouter = new Hono<AppEnv>();
const privateRead: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.header("Cache-Control", "private, no-store"); c.header("Vary", "Cookie");
  if (!(await c.var.services.rateLimit.check(`achievements-read:${currentUser(c).id}`, 120, 60)).allowed) throw ApiErrors.rateLimited();
  await next();
};
achievementsRouter.get("/me/achievements", requireAuth(), privateRead, async c => reply(c, await c.var.services.achievements.get(currentUser(c).id)));
achievementsRouter.post("/me/achievements/seen", requireAuth(), zBody(seenAchievementsSchema), async c => {
  if (!(await c.var.services.rateLimit.check(`achievements-seen:${currentUser(c).id}`, 120, 3600)).allowed) throw ApiErrors.rateLimited();
  c.var.services.achievements.markSeen(currentUser(c).id, c.req.valid("json").ids);
  return reply(c, { ok: true });
});
achievementsRouter.post("/me/collaboration-rewards/:id/seen", requireAuth(), async c => {
  if (!(await c.var.services.rateLimit.check(`collaboration-reward-seen:${currentUser(c).id}`, 120, 3600)).allowed) throw ApiErrors.rateLimited();
  c.var.services.collaboration.markRewardSeen(currentUser(c).id, c.req.param("id"));
  return reply(c, { ok: true });
});
achievementsRouter.get("/profiles/:userId/achievements", requireAuth(), privateRead, async c => reply(c, await c.var.services.achievements.publicFor(currentUser(c).id, c.req.param("userId"))));
achievementsRouter.get("/aliases/:alias/profile", requireAuth(), privateRead, async c => reply(c, await c.var.services.achievements.aliasProfile(currentUser(c).id, c.req.param("alias"))));
achievementsRouter.post("/me/admin-application", requireAuth(), async c => {
  if (!(await c.var.services.rateLimit.check(`admin-application:${currentUser(c).id}`, 3, 86400)).allowed) throw ApiErrors.rateLimited();
  c.var.services.collaboration.request(currentUser(c).id);
  return reply(c, { ok: true }, 201);
});
achievementsRouter.get("/admin/admin-applications", requireSuperAdmin, privateRead, c => reply(c, c.var.services.collaboration.applications()));
achievementsRouter.get("/admin/admin-applications/count", requireSuperAdmin, privateRead, c => reply(c, { count: c.var.services.collaboration.pendingCount() }));
achievementsRouter.post("/admin/admin-applications/:userId/review", requireSuperAdmin, zBody(reviewAdminApplicationSchema), async c => {
  await c.var.services.collaboration.review(currentUser(c).id, c.req.param("userId"), c.req.valid("json").approve, c.var.services.roles, c.var.services.restriction);
  return reply(c, { ok: true });
});
