import { Hono } from "hono";
import { checkInPhotoRequestSchema, checkInRequestSchema, extendRequestSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { allInOrder } from "../common/background.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";
import { hashIp } from "../security/security-event.service.js";

/** Automatic "Sigo acá" is only accepted with this much time (or less) left on the check-in. */
const AUTO_EXTEND_WINDOW_MS = 15 * 60_000;

export const checkinsRouter = new Hono<AppEnv>();

checkinsRouter.post("/checkins", requireAuth(), zBody(checkInRequestSchema), async (c) => {
  const { services, ip } = c.var;
  const user = currentUser(c);
  const body = c.req.valid("json");
  await services.restriction.assertNot(user.id, ["SUSPENDED", "BANNED"]);

  const presence = await services.checkIns.assertPresence(user.id, body.roomId, body.location);

  await services.antiAbuse.enforceRateLimit({
    key: `checkin:${user.id}`,
    limit: 5,
    windowSeconds: 60,
    event: { userId: user.id, eventType: "RATE_LIMITED", ip, metadata: { bucket: "checkin" } },
  });

  await services.antiAbuse.assertChallengePassed(user.id, body.turnstileToken, ip);

  const { checkIn, changes, previousRoom, adminPresent } = await services.checkIns.checkIn({
    userId: user.id,
    roomId: body.roomId,
    seatId: body.seatId,
    location: body.location,
    presence,
    showIdentity: body.showIdentity,
    qrToken: body.qrToken,
    durationMinutes: body.durationMinutes,
  });
  await services.realtime.broadcastSeatChanges(body.roomId, changes);
  if (previousRoom) await services.realtime.broadcastSeatChanges(previousRoom.roomId, previousRoom.changes);
  // Delayed by `NotificationService` itself (random 2-5 min, only if still checked in when it
  // fires) so the banner/push timing can't be correlated back to this specific check-in.
  if (adminPresent) services.notifications.scheduleAdminPresent(body.roomId, user.id);
  return reply(c, checkIn, 201);
});

checkinsRouter.delete("/checkins/current", requireAuth(), async (c) => {
  const { services } = c.var;
  const result = await services.checkIns.checkOut(currentUser(c).id);
  if (!result) throw ApiErrors.noActiveCheckIn();
  await services.realtime.broadcastSeatChanges(result.roomId, result.changes);
  return reply(c, { ok: true });
});

checkinsRouter.post("/checkins/current/extend", requireAuth(), zBody(extendRequestSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  const body = c.req.valid("json");
  // The body carries no roomId for extend — the room is whatever the caller is currently
  // checked into, never client-supplied. The restriction check and the lookup run concurrently.
  const [, active] = await allInOrder(
    services.restriction.assertNot(user.id, ["SUSPENDED", "BANNED"]),
    services.checkIns.getActiveCheckIn(user.id),
  );
  if (!active) throw ApiErrors.noActiveCheckIn();
  if (body.auto) {
    // Pro-only, and only inside the renewal window, so `auto` can't stretch a check-in forever.
    if (!(await services.pro.isProUser(user.id))) throw ApiErrors.proRequired();
    // The schema already requires it; the server never renews automatically on a stored grant.
    if (!body.location) throw ApiErrors.validation("La renovación automática necesita tu ubicación.");
    if (new Date(active.expiresAt).getTime() - Date.now() > AUTO_EXTEND_WINDOW_MS) throw ApiErrors.validation("Todavía falta para renovar.");
  }
  // With a location, `requirePresence` validates that fix against the geofence and never reads a grant.
  const presence = await services.checkIns.assertPresence(user.id, active.roomId, body.location);

  await services.antiAbuse.enforceRateLimit({ key: `extend:${user.id}`, limit: 5, windowSeconds: 60 });
  // 240 s window: stays in memory (no DO writes). Checked after the fix so a rejected one doesn't spend it.
  if (body.auto) await services.antiAbuse.enforceRateLimit({ key: `extend-auto:${user.id}`, limit: 1, windowSeconds: 240 });

  return reply(c, await services.checkIns.extend(user.id, body.location, active, body.durationMinutes, presence), 201);
});

checkinsRouter.post("/checkins/:id/photo", requireAuth(), uuidParam("id"), zBody(checkInPhotoRequestSchema), async (c) => {
  const { services, ip } = c.var;
  const user = currentUser(c);
  const body = c.req.valid("json");
  await services.restriction.assertNot(user.id, ["SUSPENDED", "BANNED"]);

  // Same as extend: no roomId in the body, so the room comes from the caller's own active
  // check-in — never trust a room the client didn't have to prove it's currently checked into.
  const active = await services.checkIns.getActiveCheckIn(user.id);
  if (!active) throw ApiErrors.noActiveCheckIn();
  const presence = await services.checkIns.assertPresence(user.id, active.roomId, body.location);

  await services.antiAbuse.enforceRateLimit({ key: `checkin-photo:${user.id}`, limit: 6, windowSeconds: 3600 });

  // A per-IP bucket on top of the per-user one — makes bulk-account abuse (many accounts, same
  // device/IP, hammering the verifier) expensive too. Keyed by a salted hash, never the raw IP.
  await services.antiAbuse.enforceRateLimit({ key: `checkin-photo-ip:${hashIp(ip)}`, limit: 20, windowSeconds: 3600 });

  const { result, changes } = await services.photoVerification.verify({
    userId: user.id,
    checkInId: c.req.param("id"),
    image: body.image,
    location: body.location,
    presence,
  });
  if (changes.length) await services.realtime.broadcastSeatChanges(result.checkIn.roomId, changes);
  return reply(c, result, 201);
});
