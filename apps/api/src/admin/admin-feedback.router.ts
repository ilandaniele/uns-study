import { Hono } from "hono";
import { FEEDBACK_STATUSES, feedbackStatusSchema, type AdminFeedbackListDto, type FeedbackStatus } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import { requireAdmin } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";

export const adminFeedbackRouter = new Hono<AppEnv>();

adminFeedbackRouter.get("/admin/feedback", requireAdmin, async (c) => {
  const status = c.req.query("status");
  if (status && !(FEEDBACK_STATUSES as readonly string[]).includes(status)) throw ApiErrors.validation("Estado inválido.");
  const items = await c.var.services.feedback.list({ status: status as FeedbackStatus | undefined });
  return reply(c, { items } satisfies AdminFeedbackListDto);
});

adminFeedbackRouter.patch("/admin/feedback/:id", requireAdmin, uuidParam("id"), zBody(feedbackStatusSchema), async (c) => {
  return reply(c, await c.var.services.feedback.setStatus(c.req.param("id"), c.req.valid("json").status));
});
