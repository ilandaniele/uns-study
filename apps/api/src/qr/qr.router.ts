import { Hono } from "hono";
import { createQrCodeSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import { requireAdminOnly } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";
import { hashIp } from "../security/security-event.service.js";

export const qrRouter = new Hono<AppEnv>();

/** Admin CRUD for a room's QR codes — role-sensitive, ADMIN only. */
qrRouter.post("/admin/rooms/:idOrSlug/qr", requireAdminOnly, zBody(createQrCodeSchema), async (c) => {
  const { qr, rooms } = c.var.services;
  const room = await rooms.findRoomRow(c.req.param("idOrSlug"));
  const tableCode = c.req.valid("json").tableCode?.trim() || null;
  return reply(c, await qr.create(room.id, tableCode), 201);
});

qrRouter.get("/admin/rooms/:idOrSlug/qr", requireAdminOnly, async (c) => {
  const { qr, rooms } = c.var.services;
  const room = await rooms.findRoomRow(c.req.param("idOrSlug"));
  return reply(c, await qr.list(room.id));
});

qrRouter.delete("/admin/rooms/:idOrSlug/qr/:id", requireAdminOnly, uuidParam("id"), async (c) => {
  const { qr, rooms } = c.var.services;
  const room = await rooms.findRoomRow(c.req.param("idOrSlug"));
  await qr.deactivate(room.id, c.req.param("id"));
  return reply(c, { ok: true });
});

/** Public resolve used by the `/q/[token]` redirect page. */
qrRouter.get("/qr/:token", async (c) => {
  const { qr, rateLimit } = c.var.services;
  const limit = await rateLimit.check(`qr-resolve-ip:${hashIp(c.var.ip)}`, 60, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  return reply(c, await qr.resolve(c.req.param("token")));
});
