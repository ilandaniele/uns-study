import { Hono } from "hono";
import { favoriteSeatsRequestSchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth, requirePro } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

const PUT_LIMIT = 20;
const WINDOW_S = 60;

/** `/rooms/:idOrSlug/favorites`: Pro favorite seats. */
export const favoritesRouter = new Hono<AppEnv>();

favoritesRouter.get("/rooms/:idOrSlug/favorites", requireAuth(), requirePro(), async (c) =>
  reply(c, await c.var.services.favoriteSeats.get(currentUser(c).id, c.req.param("idOrSlug"))),
);

favoritesRouter.put("/rooms/:idOrSlug/favorites", requireAuth(), requirePro(), zBody(favoriteSeatsRequestSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  await services.antiAbuse.enforceRateLimit({ key: `favorites:${user.id}`, limit: PUT_LIMIT, windowSeconds: WINDOW_S });
  return reply(c, await services.favoriteSeats.put(user.id, c.req.param("idOrSlug"), c.req.valid("json").seatIds));
});
