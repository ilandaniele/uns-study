import { Hono } from "hono";
import type { RankingCategory, RankingPeriod } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth, requirePro } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam } from "../http/validate.js";

const PERIODS: RankingPeriod[] = ["today", "week", "month", "all"];
const CATEGORIES: RankingCategory[] = ["study_time", "streak", "contribution"];
const DEFAULT_ROOM = "principal";

/** `/groups/:id/rankings`: Pro ranking limited to the group's members. Personalised, so never cached. */
export const groupRankingRouter = new Hono<AppEnv>();

groupRankingRouter.get("/groups/:id/rankings", requireAuth(), requirePro(), uuidParam("id"), async (c) => {
  const period = c.req.query("period");
  const category = c.req.query("category");
  c.header("Cache-Control", "private, no-store");
  const safePeriod = PERIODS.includes(period as RankingPeriod) ? (period as RankingPeriod) : "today";
  const safeCategory = CATEGORIES.includes(category as RankingCategory) ? (category as RankingCategory) : "study_time";
  const room = c.req.query("room") || DEFAULT_ROOM;
  return reply(c, await c.var.services.groupRanking.getGroupRanking(c.req.param("id"), currentUser(c).id, room, safePeriod, safeCategory));
});
