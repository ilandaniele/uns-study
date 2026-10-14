import { Hono } from "hono";
import { announcementSchema } from "@sala/contracts";
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
  realtime.emitAnnouncementChanged(created.roomId, created);
  return reply(c, created, 201);
});

adminAnnouncementsRouter.patch("/admin/announcements/:id", requireAdmin, requireAdminOnly, uuidParam("id"), zBody(announcementSchema.partial()), async (c) => {
  const { announcements, realtime } = c.var.services;
  const updated = await announcements.update(c.req.param("id"), c.req.valid("json"));
  realtime.emitAnnouncementChanged(updated.roomId, updated);
  return reply(c, updated);
});

adminAnnouncementsRouter.delete("/admin/announcements/:id", requireAdmin, requireAdminOnly, uuidParam("id"), async (c) => {
  const { announcements, realtime } = c.var.services;
  const id = c.req.param("id");
  const roomId = await announcements.remove(id);
  realtime.emitAnnouncementChanged(roomId, { id, removed: true });
  return reply(c, { ok: true });
});
