import { Hono } from "hono";
import { updateCheckInIdentitySchema } from "@sala/contracts";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

/** Lets the caller toggle "Mostrar mi identidad" on their current check-in without re-checking-in. */
export const checkinIdentityRouter = new Hono<AppEnv>();

checkinIdentityRouter.patch("/checkins/current/identity", requireAuth(), zBody(updateCheckInIdentitySchema), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.profiles.updateCheckInIdentity(user.id, c.req.valid("json").showIdentity));
});
