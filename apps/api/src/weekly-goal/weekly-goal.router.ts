import { Hono } from "hono";
import { weeklyGoalRequestSchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth, requirePro } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

const PUT_LIMIT = 10;
const WINDOW_S = 60;

/** `/me/weekly-goal`: Pro weekly study goal. */
export const weeklyGoalRouter = new Hono<AppEnv>();

weeklyGoalRouter.get("/me/weekly-goal", requireAuth(), requirePro(), async (c) =>
  reply(c, await c.var.services.weeklyGoal.get(currentUser(c).id)),
);

weeklyGoalRouter.put("/me/weekly-goal", requireAuth(), requirePro(), zBody(weeklyGoalRequestSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  await services.antiAbuse.enforceRateLimit({ key: `weekly-goal:${user.id}`, limit: PUT_LIMIT, windowSeconds: WINDOW_S });
  return reply(c, await services.weeklyGoal.put(user.id, c.req.valid("json")));
});
