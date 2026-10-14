import { Hono } from "hono";
import { announcementSchema, SocketEvents, type AnnouncementDto } from "@sala/contracts";
import type { RealtimeHub } from "../realtime/realtime-hub.js";
import type { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAdmin, requireAdminOnly } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";

export const adminAnnouncementsRouter = new Hono<AppEnv>();

/** Listing is available to MODERATOR too; writes (create/update/delete) are role-sensitive and ADMIN only. */
adminAnnouncementsRouter.get("/admin/announcements", requireAdmin, async (c) => {
  return reply(c, await c.var.services.announcements.listAll());
});

adminAnnouncementsRouter.post("/admin/announcements", requireAdmin, requireAdminOnly, zBody(announcementSchema), async (c) => {
  const { announcements, realtime } = c.var.services;
  const created = await announcements.create(c.req.valid("json"), currentUser(c).id);
  emitChanged(realtime, created.roomId, created);
  return reply(c, created, 201);
});

adminAnnouncementsRouter.patch("/admin/announcements/:id", requireAdmin, requireAdminOnly, uuidParam("id"), zBody(announcementSchema.partial()), async (c) => {
  const { announcements, realtime } = c.var.services;
  const updated = await announcements.update(c.req.param("id"), c.req.valid("json"));
  emitChanged(realtime, updated.roomId, updated);
  return reply(c, updated);
});

adminAnnouncementsRouter.delete("/admin/announcements/:id", requireAdmin, requireAdminOnly, uuidParam("id"), async (c) => {
  const { announcements, realtime } = c.var.services;
  const id = c.req.param("id");
  const roomId = await announcements.remove(id);
  emitChanged(realtime, roomId, { id, removed: true });
  return reply(c, { ok: true });
});

/** The gateway has no announcement-specific emitter; the banner event goes straight through its hub. */
function emitChanged(realtime: RoomRealtimeGateway, roomId: AnnouncementDto["roomId"], payload: unknown): void {
  const { hub } = realtime as unknown as { hub: RealtimeHub };
  if (roomId) hub.publishToRoom(roomId, SocketEvents.AnnouncementChanged, payload);
  else hub.broadcast(SocketEvents.AnnouncementChanged, payload);
}
