import { Hono } from "hono";
import { roomModeSchema, seatCalibrationSchema, simpleCheckInRequestSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth, requireSuperAdmin } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

export const simpleRoomRouter = new Hono<AppEnv>();
for (const path of ["/me/room-mode", "/checkins/simple", "/admin/rooms/:slug/seat-calibration"]) {
  simpleRoomRouter.use(path, async (c, next) => { c.header("Cache-Control", "private, no-store"); await next(); });
}

simpleRoomRouter.get("/me/room-mode", requireAuth(), c => reply(c, c.var.services.simpleRoom.mode(currentUser(c).id)));
simpleRoomRouter.patch("/me/room-mode", requireAuth(), zBody(roomModeSchema), async c => {
  const userId = currentUser(c).id;
  if (!(await c.var.services.rateLimit.check(`room-mode:${userId}`, 30, 60)).allowed) throw ApiErrors.rateLimited();
  return reply(c, c.var.services.simpleRoom.setMode(userId, c.req.valid("json")));
});

simpleRoomRouter.post("/checkins/simple", requireAuth(), zBody(simpleCheckInRequestSchema), async c => {
  const { services, ip } = c.var, userId = currentUser(c).id, input = c.req.valid("json");
  await services.restriction.assertNot(userId, ["SUSPENDED", "BANNED"]);
  // A fresh fix is mandatory; a previously issued room-presence grant cannot locate a seat.
  const presence = await services.checkIns.assertPresence(userId, input.roomId, input.location);
  await services.antiAbuse.enforceRateLimit({ key: `checkin:${userId}`, limit: 5, windowSeconds: 60,
    event: { userId, eventType: "RATE_LIMITED", ip, metadata: { bucket: "checkin" } } });
  await services.antiAbuse.assertChallengePassed(userId, input.turnstileToken, ip);
  const { result, write } = await services.simpleRoom.attempt(userId, input, presence);
  if (write) {
    await services.realtime.broadcastSeatChanges(input.roomId, write.changes);
    if (write.previousRoom) await services.realtime.broadcastSeatChanges(write.previousRoom.roomId, write.previousRoom.changes);
    if (write.adminPresent) services.notifications.scheduleAdminPresent(input.roomId, userId);
  }
  return reply(c, result, result.outcome === "CHECKED_IN" ? 201 : 200);
});

simpleRoomRouter.get("/admin/rooms/:slug/seat-calibration", requireSuperAdmin, async c => reply(c, await c.var.services.simpleRoom.calibration(currentUser(c).id, c.req.param("slug"))));
simpleRoomRouter.put("/admin/rooms/:slug/seat-calibration", requireSuperAdmin, zBody(seatCalibrationSchema), async c => {
  const userId = currentUser(c).id;
  if (!(await c.var.services.rateLimit.check(`seat-calibration:${userId}`, 10, 60)).allowed) throw ApiErrors.rateLimited();
  return reply(c, await c.var.services.simpleRoom.saveCalibration(userId, c.req.param("slug"), c.req.valid("json")));
});
simpleRoomRouter.delete("/admin/rooms/:slug/seat-calibration", requireSuperAdmin, async c => {
  await c.var.services.simpleRoom.clearCalibration(currentUser(c).id, c.req.param("slug"));
  return reply(c, { ok: true });
});
