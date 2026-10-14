import { Hono } from "hono";
import { attachmentRequestSchema, createReportSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";

export const reportsRouter = new Hono<AppEnv>();

reportsRouter.post("/users/:userId/reports", requireAuth(), zBody(createReportSchema), async (c) => {
  const user = currentUser(c);
  const created = await c.var.services.reports.createReport({ reporterId: user.id, reportedUserId: c.req.param("userId"), ...c.req.valid("json") });
  return reply(c, created, 201);
});

reportsRouter.post("/reports/:id/attachments", requireAuth(), uuidParam("id"), zBody(attachmentRequestSchema), async (c) => {
  const user = currentUser(c);
  const { reports, rateLimit } = c.var.services;
  const limit = await rateLimit.check(`report-attachment:${user.id}`, 10, 3600);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  const body = c.req.valid("json");
  return reply(c, await reports.requestAttachment(c.req.param("id"), user.id, body.contentType, body.sizeBytes), 201);
});

reportsRouter.post("/reports/:id/attachments/:attachmentId/complete", requireAuth(), uuidParam("id", "attachmentId"), async (c) => {
  const user = currentUser(c);
  const { reports, rateLimit } = c.var.services;
  const limit = await rateLimit.check(`report-attachment-complete:${user.id}`, 10, 3600);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  await reports.completeAttachment(c.req.param("id"), c.req.param("attachmentId"), user.id);
  return reply(c, { ok: true }, 201);
});
