import { Hono } from "hono";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAdmin, requireSuperAdmin } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { z } from "zod";
import { zBody } from "../http/validate.js";
import { ApiErrors } from "../common/api-error.js";

export const adminAuditRouter = new Hono<AppEnv>();

adminAuditRouter.delete("/admin/audit", requireSuperAdmin, zBody(z.object({ confirmation: z.literal("DELETE_EXISTING_AUDIT") }).strict()), async c => {
  const actorId = currentUser(c).id;
  const limit = await c.var.services.rateLimit.check(`admin:audit-clear:${actorId}`, 2, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  return reply(c, c.var.services.adminAudit.clearExisting(actorId));
});

adminAuditRouter.get("/admin/audit", requireAdmin, async (c) => {
  c.header("Cache-Control", "private, no-store"); c.header("Vary", "Cookie");
  const ownerMetadata = await c.var.services.roles.isSuperAdmin(currentUser(c).id);
  return reply(c, await c.var.services.adminAudit.list(c.req.query("cursor"), c.req.query("userId") || undefined, ownerMetadata));
});
