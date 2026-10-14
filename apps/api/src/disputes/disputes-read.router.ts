import { Hono } from "hono";
import type { AppEnv } from "../http/context.js";
import { optionalAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam } from "../http/validate.js";

/** Public reads (personalized with `myVote`/`iAm*` when a session is present). */
export const disputesReadRouter = new Hono<AppEnv>();

disputesReadRouter.get("/disputes/:id", optionalAuth, uuidParam("id"), async (c) => {
  const { services, user } = c.var;
  return reply(c, await services.disputes.getById(c.req.param("id"), user?.id ?? null));
});

disputesReadRouter.get("/rooms/:idOrSlug/disputes", optionalAuth, async (c) => {
  const { services, user } = c.var;
  const room = await services.rooms.findRoomRow(c.req.param("idOrSlug"));
  return reply(c, await services.disputes.listOpenForRoom(room.id, user?.id ?? null));
});
