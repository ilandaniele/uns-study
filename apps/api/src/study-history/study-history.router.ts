import { Hono } from "hono";
import { studyHistoryQuerySchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth, requirePro } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zQuery } from "../http/validate.js";

/** `/me/study-history`: Pro study history over the last 30 or 90 days. */
export const studyHistoryRouter = new Hono<AppEnv>();

studyHistoryRouter.get("/me/study-history", requireAuth(), requirePro(), zQuery(studyHistoryQuerySchema), async (c) => {
  const days = Number(c.req.valid("query").days) as 30 | 90;
  return reply(c, await c.var.services.studyHistory.history(currentUser(c).id, days));
});
