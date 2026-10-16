import { Hono } from "hono";
import { streakFreezeRequestSchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth, requirePro } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

const FREEZE_LIMIT = 5;
const WINDOW_S = 60;

/** `/me/{streak,streak-freeze,badges}`: streak and freeze are Pro; badges are visible to every signed-in user. */
export const streakBadgesRouter = new Hono<AppEnv>();

streakBadgesRouter.get("/me/streak", requireAuth(), requirePro(), async (c) =>
  reply(c, await c.var.services.streakBadges.streak(currentUser(c).id)),
);

streakBadgesRouter.post("/me/streak-freeze", requireAuth(), requirePro(), zBody(streakFreezeRequestSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  await services.antiAbuse.enforceRateLimit({ key: `streak-freeze:${user.id}`, limit: FREEZE_LIMIT, windowSeconds: WINDOW_S });
  return reply(c, await services.streakBadges.freeze(user.id, c.req.valid("json").localDate));
});

streakBadgesRouter.get("/me/badges", requireAuth(), async (c) =>
  reply(c, await c.var.services.streakBadges.badges(currentUser(c).id)),
);
