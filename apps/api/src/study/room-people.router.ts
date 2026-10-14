import { Hono } from "hono";
import type { AppEnv } from "../http/context.js";
import { currentUser } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";

export const roomPeopleRouter = new Hono<AppEnv>();

roomPeopleRouter.get("/rooms/:idOrSlug/people", requireAuth(), async (c) => {
  const { services } = c.var;
  const room = await services.rooms.findRoomRow(c.req.param("idOrSlug"));
  return reply(c, await services.roomPeople.listPeople(room.id, currentUser(c).id));
});

roomPeopleRouter.get("/rooms/:idOrSlug/occupants", requireAuth(), async (c) => {
  const { services } = c.var;
  const room = await services.rooms.findRoomRow(c.req.param("idOrSlug"));
  return reply(c, await services.roomPeople.listOccupants(room.id, currentUser(c).id));
});
