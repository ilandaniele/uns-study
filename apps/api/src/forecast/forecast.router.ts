import { Hono } from "hono";
import type { AppEnv } from "../http/context.js";
import { requireAuth, requirePro } from "../http/guards.js";
import { reply } from "../http/reply.js";

/** `/rooms/:idOrSlug/forecast`: Pro occupancy forecast. */
export const forecastRouter = new Hono<AppEnv>();

forecastRouter.get("/rooms/:idOrSlug/forecast", requireAuth(), requirePro(), async (c) =>
  reply(c, await c.var.services.forecast.get(c.req.param("idOrSlug"))),
);
