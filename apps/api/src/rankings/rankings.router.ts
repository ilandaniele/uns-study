import { Hono } from "hono";
import type { RankingCategory, RankingPeriod } from "@sala/contracts";
import type { AppEnv } from "../http/context.js";
import { optionalAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";

const PERIODS: RankingPeriod[] = ["today", "week", "month", "all"];
const CATEGORIES: RankingCategory[] = ["study_time", "streak", "contribution"];

/** Public read (personalized with `me` when a session is present). */
export const rankingsRouter = new Hono<AppEnv>();

rankingsRouter.get("/rooms/:idOrSlug/rankings", optionalAuth, async (c) => {
  const { services, user } = c.var;
  const period = c.req.query("period");
  const category = c.req.query("category");
  // Anonymous responses are identical for everyone, so browsers/CDNs may reuse them briefly;
  // anything personalised (`me`) stays private. `Vary: Cookie` keeps a shared cache from mixing them.
  c.header("Vary", "Cookie");
  c.header("Cache-Control", user ? "private, no-cache" : "public, max-age=30, stale-while-revalidate=60");
  const safePeriod = PERIODS.includes(period as RankingPeriod) ? (period as RankingPeriod) : "today";
  const safeCategory = CATEGORIES.includes(category as RankingCategory) ? (category as RankingCategory) : "study_time";
  return reply(c, await services.rankings.getRankings(c.req.param("idOrSlug"), safePeriod, safeCategory, user?.id ?? null));
});
