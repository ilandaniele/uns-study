import { Hono } from "hono";
import { focusCommandSchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { zBody } from "../http/validate.js";

export const focusRouter = new Hono<AppEnv>();
focusRouter.use("/me/focus*", requireAuth());
focusRouter.use("/me/focus*", async (c, next) => { c.header("Cache-Control", "private, no-store"); c.header("Vary", "Cookie"); await next(); });
focusRouter.get("/me/focus", c => c.json(c.var.services.focus.get(currentUser(c).id)));
focusRouter.post("/me/focus", zBody(focusCommandSchema), async c => {
  const userId = currentUser(c).id;
  await c.var.services.antiAbuse.enforceRateLimit({ key: `focus:${userId}`, limit: 90, windowSeconds: 60 });
  return c.json(c.var.services.focus.command(userId, c.req.valid("json")));
});
