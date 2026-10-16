import { Hono } from "hono";
import { groupFocusRequestSchema, groupSeatShareRequestSchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth, requirePro } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";

const FOCUS_LIMIT = 6;
const WINDOW_S = 60;

/**
 * `/groups/:id/{presence,seat-share,focus}`: Pro group study. The seat-share opt-out is open to every
 * member (privacy controls are not paywalled); reading presence and the focus timer are Pro.
 */
export const groupStudyRouter = new Hono<AppEnv>();

groupStudyRouter.get("/groups/:id/presence", requireAuth(), requirePro(), uuidParam("id"), async (c) =>
  reply(c, await c.var.services.groupStudy.presence(c.req.param("id"), currentUser(c).id)),
);

groupStudyRouter.put("/groups/:id/seat-share", requireAuth(), uuidParam("id"), zBody(groupSeatShareRequestSchema), async (c) => {
  await c.var.services.groupStudy.setSeatShare(c.req.param("id"), currentUser(c).id, c.req.valid("json").share);
  return reply(c, null, 204);
});

groupStudyRouter.post("/groups/:id/focus", requireAuth(), requirePro(), uuidParam("id"), zBody(groupFocusRequestSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  await services.antiAbuse.enforceRateLimit({ key: `group-focus:${user.id}`, limit: FOCUS_LIMIT, windowSeconds: WINDOW_S });
  return reply(c, await services.groupStudy.startFocus(c.req.param("id"), user.id, c.req.valid("json").minutes));
});

groupStudyRouter.delete("/groups/:id/focus", requireAuth(), requirePro(), uuidParam("id"), async (c) => {
  await c.var.services.groupStudy.stopFocus(c.req.param("id"), currentUser(c).id);
  return reply(c, null, 204);
});
