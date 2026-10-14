import { Hono } from "hono";
import { incumbentRespondSchema, openDisputeSchema, voteDisputeSchema } from "@sala/contracts";
import type { AppEnv } from "../http/context.js";
import { currentUser } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { uuidParam, zBody } from "../http/validate.js";

/** Every action here mutates a dispute and requires an authenticated session. */
export const disputesRouter = new Hono<AppEnv>();

disputesRouter.post("/disputes", requireAuth(), zBody(openDisputeSchema), async (c) => {
  const { services, ip } = c.var;
  const user = currentUser(c);
  const body = c.req.valid("json");

  await services.restriction.assertNot(user.id, ["RESTRICT_OBSERVATIONS", "SUSPENDED", "BANNED"]);

  const presence = await services.disputes.assertPresence(user.id, body.roomId, body.location);

  await services.antiAbuse.enforceRateLimit({
    key: `dispute:open:${user.id}`,
    limit: 3,
    windowSeconds: 3600,
    event: { userId: user.id, eventType: "DISPUTE_SPAM", ip, metadata: { bucket: "dispute_open" } },
  });

  const { dispute } = await services.disputes.open({
    userId: user.id,
    roomId: body.roomId,
    seatId: body.seatId,
    kind: body.kind,
    location: body.location,
    presence,
  });
  return reply(c, dispute, 201);
});

disputesRouter.post("/disputes/:id/votes", requireAuth(), uuidParam("id"), zBody(voteDisputeSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  const body = c.req.valid("json");

  await services.antiAbuse.enforceRateLimit({ key: `dispute:vote:${user.id}`, limit: 20, windowSeconds: 600 });

  return reply(c, await services.disputes.vote(c.req.param("id"), user.id, body.vote, body.location), 201);
});

disputesRouter.post("/disputes/:id/respond", requireAuth(), uuidParam("id"), zBody(incumbentRespondSchema), async (c) => {
  const { services } = c.var;
  const user = currentUser(c);
  const body = c.req.valid("json");

  await services.antiAbuse.enforceRateLimit({ key: `dispute:respond:${user.id}`, limit: 5, windowSeconds: 60 });

  const { dispute } = await services.disputes.respond(c.req.param("id"), user.id, body.action, body.location);
  return reply(c, dispute, 201);
});
