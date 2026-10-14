import { Hono } from "hono";
import { reportStatusSchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAdmin } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";

export const adminReportsRouter = new Hono<AppEnv>();

adminReportsRouter.get("/admin/reports", requireAdmin, async (c) => {
  return reply(c, await c.var.services.adminReports.list(c.req.query("status"), c.req.query("cursor"), currentUser(c).id));
});

adminReportsRouter.get("/admin/reports/:id", requireAdmin, uuidParam("id"), async (c) => {
  return reply(c, await c.var.services.adminReports.getById(c.req.param("id"), currentUser(c).id));
});

adminReportsRouter.patch("/admin/reports/:id", requireAdmin, uuidParam("id"), zBody(reportStatusSchema), async (c) => {
  return reply(c, await c.var.services.adminReports.setStatus(c.req.param("id"), c.req.valid("json").status, currentUser(c).id));
});

adminReportsRouter.get("/admin/reports/:id/attachments/:attachmentId/url", requireAdmin, uuidParam("id", "attachmentId"), async (c) => {
  const url = await c.var.services.adminReports.getAttachmentUrl(c.req.param("id"), c.req.param("attachmentId"), currentUser(c).id);
  return reply(c, { url });
});
