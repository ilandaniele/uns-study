import { Hono } from "hono";
import { deleteAccountSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

/** Account deletion ("Eliminar cuenta"): checks the user out, then deletes the `user` row (cascades). */
export const accountRouter = new Hono<AppEnv>();

accountRouter.post("/me/delete", requireAuth({ allowRestricted: true }), zBody(deleteAccountSchema), async (c) => {
  const user = currentUser(c);
  const { rateLimit, checkIns, realtime, profiles } = c.var.services;
  const limit = await rateLimit.check(`account-delete:${user.id}`, 3, 86400);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  const checkoutResult = await checkIns.checkOut(user.id);
  if (checkoutResult) await realtime.broadcastSeatChanges(checkoutResult.roomId, checkoutResult.changes);

  await profiles.deleteAccount(user.id);
  return reply(c, { ok: true });
});
