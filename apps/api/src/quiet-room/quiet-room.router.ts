import { Hono } from "hono";
import type { QuietWatchResponse } from "@sala/contracts";
import { quietWatchRequestSchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth, requirePro } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

const PUT_LIMIT = 10;
const WINDOW_S = 60;

/** `/rooms/:idOrSlug/quiet-watch`: Pro quiet-room alert. DELETE is not gated so a lapsed user can still clear it. */
export const quietRoomRouter = new Hono<AppEnv>();

quietRoomRouter.get("/rooms/:idOrSlug/quiet-watch", requireAuth(), requirePro(), async (c) => {
  const watch = await c.var.services.quietRoom.get(currentUser(c).id, c.req.param("idOrSlug"));
  return reply(c, { watch } satisfies QuietWatchResponse);
});

quietRoomRouter.put("/rooms/:idOrSlug/quiet-watch", requireAuth(), requirePro(), zBody(quietWatchRequestSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  await services.antiAbuse.enforceRateLimit({ key: `quiet-watch:${user.id}`, limit: PUT_LIMIT, windowSeconds: WINDOW_S });
  const watch = await services.quietRoom.put(user.id, c.req.param("idOrSlug"), c.req.valid("json").thresholdPct);
  return reply(c, { watch } satisfies QuietWatchResponse);
});

quietRoomRouter.delete("/rooms/:idOrSlug/quiet-watch", requireAuth(), async (c) => {
  await c.var.services.quietRoom.remove(currentUser(c).id);
  return reply(c, null, 204);
});
