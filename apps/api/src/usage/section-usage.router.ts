import { Hono } from "hono";
import { sectionVisitSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import { requireAdmin } from "../http/guards.js";
import { zBody } from "../http/validate.js";
import { hashIp } from "../security/security-event.service.js";

export const sectionUsageRouter = new Hono<AppEnv>();

sectionUsageRouter.post("/usage/section", zBody(sectionVisitSchema), async c => {
  // A short in-memory bucket: never persist a visitor identifier for these aggregate counts.
  const limit = await c.var.services.rateLimit.check(`section-usage:${hashIp(c.var.ip)}`, 30, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  c.var.services.sectionUsage.record(c.req.valid("json").section);
  c.header("Cache-Control", "no-store");
  return c.body(null, 204);
});

sectionUsageRouter.get("/admin/usage/sections", requireAdmin, c => {
  const days = c.req.query("days") ?? "7";
  if (days !== "7" && days !== "30") throw ApiErrors.validation("Elegí 7 o 30 días.");
  c.header("Cache-Control", "private, no-store");
  return c.json(c.var.services.sectionUsage.get(days === "7" ? 7 : 30));
});
