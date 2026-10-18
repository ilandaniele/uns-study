import { Hono } from "hono";
import { adminMarkSeatsSchema, markAllOccupiedSchema, testGeofenceSchema, updateGeofenceSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAdmin, requireAdminOnly } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

export const adminRoomsRouter = new Hono<AppEnv>();

adminRoomsRouter.get("/admin/rooms/:idOrSlug/live", requireAdmin, async (c) => {
  return reply(c, await c.var.services.adminRooms.live(c.req.param("idOrSlug"), currentUser(c).id));
});

adminRoomsRouter.get("/admin/rooms/:idOrSlug/stats", requireAdmin, async (c) => {
  return reply(c, await c.var.services.adminRooms.stats(c.req.param("idOrSlug")));
});

adminRoomsRouter.get("/admin/rooms/:idOrSlug/geofence", requireAdmin, async (c) => {
  return reply(c, await c.var.services.adminRooms.getGeofence(c.req.param("idOrSlug")));
});

adminRoomsRouter.post("/admin/rooms/:idOrSlug/geofence/test", requireAdmin, zBody(testGeofenceSchema), async (c) => {
  const { adminRooms, rateLimit } = c.var.services;
  const limit = await rateLimit.check(`admin:geofence-test:${currentUser(c).id}`, 20, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  return reply(c, await adminRooms.testGeofence(c.req.param("idOrSlug"), c.req.valid("json").location), 201);
});

adminRoomsRouter.put("/admin/rooms/:idOrSlug/geofence", requireAdmin, requireAdminOnly, zBody(updateGeofenceSchema), async (c) => {
  return reply(c, await c.var.services.adminRooms.updateGeofence(c.req.param("idOrSlug"), currentUser(c).id, c.req.valid("json")));
});

adminRoomsRouter.post("/admin/rooms/:idOrSlug/mark-all-occupied", requireAdmin, zBody(markAllOccupiedSchema), async (c) => {
  const user = currentUser(c);
  const { adminRooms, rateLimit, realtime } = c.var.services;
  const limit = await rateLimit.check(`admin:mark-all-occupied:${user.id}`, 10, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  const { roomId, count, expiresAt, changes } = await adminRooms.markAllOccupied(c.req.param("idOrSlug"), user.id, c.req.valid("json").minutes);
  await realtime.broadcastSeatChanges(roomId, changes);
  return reply(c, { count, expiresAt: expiresAt.toISOString() }, 201);
});

adminRoomsRouter.post("/admin/rooms/:idOrSlug/mark-seats", requireAdmin, zBody(adminMarkSeatsSchema), async (c) => {
  const user = currentUser(c);
  const { adminRooms, rateLimit, realtime } = c.var.services;
  const limit = await rateLimit.check(`admin:mark-all-occupied:${user.id}`, 10, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  const { seatIds, status } = c.req.valid("json");
  const { roomId, count, skipped, expiresAt, changes } = await adminRooms.markSeats(c.req.param("idOrSlug"), user.id, seatIds, status);
  await realtime.broadcastSeatChanges(roomId, changes);
  return reply(c, { count, skipped, expiresAt: expiresAt.toISOString() }, 201);
});

adminRoomsRouter.post("/admin/rooms/:idOrSlug/mark-all-occupied/undo", requireAdmin, async (c) => {
  const user = currentUser(c);
  const { adminRooms, rateLimit, realtime } = c.var.services;
  const limit = await rateLimit.check(`admin:mark-all-occupied:${user.id}`, 10, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  const { roomId, count, changes } = await adminRooms.undoMarkAllOccupied(c.req.param("idOrSlug"), user.id);
  await realtime.broadcastSeatChanges(roomId, changes);
  return reply(c, { count }, 201);
});
