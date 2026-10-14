import { Hono } from "hono";
import { updateNotificationPreferencesSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

export const notificationPreferencesRouter = new Hono<AppEnv>();

notificationPreferencesRouter.get("/notifications/preferences", requireAuth(), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.notificationPreferences.get(user.id));
});

notificationPreferencesRouter.put("/notifications/preferences", requireAuth(), zBody(updateNotificationPreferencesSchema), async (c) => {
  const user = currentUser(c);
  const limit = await c.var.services.rateLimit.check(`notif-prefs:${user.id}`, 30, 3600);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  return reply(c, await c.var.services.notificationPreferences.update(user.id, c.req.valid("json")));
});
