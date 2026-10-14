import { Hono } from "hono";
import { observationRequestSchema, type SeatStateChangedEvent } from "@sala/contracts";
import { allInOrder } from "../common/background.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

export const observationsRouter = new Hono<AppEnv>();

observationsRouter.post("/observations", requireAuth(), zBody(observationRequestSchema), async (c) => {
  const { services, ip } = c.var;
  const user = currentUser(c);
  const body = c.req.valid("json");
  // Independent reads run concurrently; a failed restriction check still wins over the rest.
  const [, limits] = await allInOrder(
    services.restriction.assertNot(user.id, ["RESTRICT_OBSERVATIONS", "SUSPENDED", "BANNED"]),
    services.abusePolicy.observationLimits(user.id),
  );

  const presence = await services.observations.assertPresence(user.id, body.roomId, body.location);

  await services.antiAbuse.enforceRateLimit({
    key: `observation:${user.id}`,
    limit: limits.perMinuteLimit,
    windowSeconds: 60,
    event: { userId: user.id, eventType: "RATE_LIMITED", ip, metadata: { bucket: "observation" } },
  });

  await services.antiAbuse.assertChallengePassed(user.id, body.turnstileToken, ip);

  const { roomId, changes, dispute } = await services.observations.observe({
    userId: user.id,
    roomId: body.roomId,
    seatId: body.seatId,
    status: body.status,
    location: body.location,
    presence,
    ip,
    qrToken: body.qrToken,
    limits,
  });
  await services.realtime.broadcastSeatChanges(roomId, changes);
  // The resulting seat states (server timestamps) let the client confirm its optimistic update
  // right away; an empty list means the observation didn't change any seat.
  const seats: SeatStateChangedEvent[] = changes.map((change) => ({
    roomId,
    seatId: change.seatId,
    status: change.status,
    confidence: change.confidence,
    lastUpdatedAt: change.lastUpdatedAt.toISOString(),
    verified: change.verified,
    occupiedUntil: change.occupiedUntil ? change.occupiedUntil.toISOString() : null,
  }));
  // `dispute`: the vote an "Está libre" report opened (or joined), so the reporter sees it.
  return reply(c, { ok: true, seats, dispute }, 201);
});
