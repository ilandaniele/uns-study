import { Hono } from "hono";
import type { AppEnv } from "../http/context.js";
import { reply } from "../http/reply.js";

export const announcementsRouter = new Hono<AppEnv>();

/** Public, read-only: banner copy for the room page. */
announcementsRouter.get("/rooms/:idOrSlug/announcements", async (c) => {
  const { rooms, announcements } = c.var.services;
  const room = await rooms.findRoomRow(c.req.param("idOrSlug"));
  return reply(c, await announcements.listActive(room.id));
});
