import { Hono } from "hono";
import { presenceValidateSchema, type PresenceGrantDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

export const presenceRouter = new Hono<AppEnv>();

/** Until when the caller may act in the room without sending a new fix (see `PresenceService.requirePresence`). */
presenceRouter.get("/presence/grant", requireAuth(), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  const roomId = c.req.query("roomId");
  if (!roomId || roomId.length > 100) throw ApiErrors.validation();
  const expiresAt = await services.checkIns.presenceGrantExpiresAt(user.id, roomId);
  const body: PresenceGrantDto = { expiresAt: expiresAt ? expiresAt.toISOString() : null };
  return reply(c, body);
});

presenceRouter.post("/presence/validate", requireAuth(), zBody(presenceValidateSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  const body = c.req.valid("json");
  const limit = await services.rateLimit.check(`presence:${user.id}`, 10, 60);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  const room = await services.rooms.findRoomRow(body.roomId);
  return reply(
    c,
    services.presence.validate(room, {
      latitude: body.latitude,
      longitude: body.longitude,
      accuracy: body.accuracy,
      capturedAt: body.capturedAt,
      sentAt: body.sentAt,
    }),
  );
});
