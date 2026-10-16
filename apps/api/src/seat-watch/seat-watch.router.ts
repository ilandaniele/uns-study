import { Hono } from "hono";
import type { SeatWatchResponse } from "@sala/contracts";
import { seatWatchRequestSchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth, requirePro } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

const PUT_LIMIT = 10;
const WINDOW_S = 60;

/** `/rooms/:idOrSlug/seat-watch`: Pro seat watch. DELETE is not gated so a lapsed user can still clear it. */
export const seatWatchRouter = new Hono<AppEnv>();

seatWatchRouter.get("/rooms/:idOrSlug/seat-watch", requireAuth(), requirePro(), async (c) => {
  const watch = await c.var.services.seatWatch.get(currentUser(c).id, c.req.param("idOrSlug"));
  return reply(c, { watch } satisfies SeatWatchResponse);
});

seatWatchRouter.put("/rooms/:idOrSlug/seat-watch", requireAuth(), requirePro(), zBody(seatWatchRequestSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  await services.antiAbuse.enforceRateLimit({ key: `seat-watch:${user.id}`, limit: PUT_LIMIT, windowSeconds: WINDOW_S });
  const watch = await services.seatWatch.put(user.id, c.req.param("idOrSlug"), c.req.valid("json").seatIds);
  return reply(c, { watch } satisfies SeatWatchResponse);
});

seatWatchRouter.delete("/rooms/:idOrSlug/seat-watch", requireAuth(), async (c) => {
  await c.var.services.seatWatch.remove(currentUser(c).id);
  return reply(c, null, 204);
});
