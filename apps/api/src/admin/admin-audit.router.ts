import { Hono } from "hono";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAdmin } from "../http/guards.js";
import { reply } from "../http/reply.js";

export const adminAuditRouter = new Hono<AppEnv>();

adminAuditRouter.get("/admin/audit", requireAdmin, async (c) => {
  c.header("Cache-Control", "private, no-store"); c.header("Vary", "Cookie");
  const ownerMetadata = await c.var.services.roles.isSuperAdmin(currentUser(c).id);
  return reply(c, await c.var.services.adminAudit.list(c.req.query("cursor"), c.req.query("userId") || undefined, ownerMetadata));
});
