import { Hono } from "hono";
import type { AppEnv } from "../http/context.js";
import { reply } from "../http/reply.js";
import { etagMatches, roomMapEtag } from "./map-etag.js";

export const roomsRouter = new Hono<AppEnv>();

roomsRouter.get("/rooms", async (c) => reply(c, await c.var.services.rooms.listRooms()));

roomsRouter.get("/rooms/:idOrSlug", async (c) => reply(c, await c.var.services.rooms.getRoom(c.req.param("idOrSlug"))));

/** Always revalidated (`no-cache`): an unchanged map costs a tiny 304 instead of the full JSON. */
roomsRouter.get("/rooms/:idOrSlug/map", async (c) => {
  const map = await c.var.services.rooms.getRoomMap(c.req.param("idOrSlug"));
  const etag = roomMapEtag(map);
  c.header("Cache-Control", "no-cache");
  c.header("ETag", etag);
  if (etagMatches(c.req.header("if-none-match"), etag)) return c.body(null, 304);
  return reply(c, map);
});
