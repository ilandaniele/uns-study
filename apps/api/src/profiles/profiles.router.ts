import { Hono } from "hono";
import { updatePrivacySchema, updateProfileSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

export const profilesRouter = new Hono<AppEnv>();

// Profile and privacy edits share one bucket.
async function checkWriteLimit(rateLimit: { check(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean }> }, userId: string): Promise<void> {
  const limit = await rateLimit.check(`profile-write:${userId}`, 30, 3600);
  if (!limit.allowed) throw ApiErrors.rateLimited();
}

profilesRouter.get("/profiles/me", requireAuth(), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.profiles.getMyProfile(user.id, user.email));
});

profilesRouter.patch("/profiles/me", requireAuth(), zBody(updateProfileSchema), async (c) => {
  const user = currentUser(c);
  await checkWriteLimit(c.var.services.rateLimit, user.id);
  return reply(c, await c.var.services.profiles.updateMyProfile(user.id, user.email, c.req.valid("json")));
});

profilesRouter.get("/profiles/me/privacy", requireAuth(), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.profiles.getMyPrivacy(user.id));
});

profilesRouter.patch("/profiles/me/privacy", requireAuth(), zBody(updatePrivacySchema), async (c) => {
  const user = currentUser(c);
  await checkWriteLimit(c.var.services.rateLimit, user.id);
  return reply(c, await c.var.services.profiles.updateMyPrivacy(user.id, c.req.valid("json")));
});

// Registered after the static `/profiles/me*` routes so "me" is not parsed as a user id.
profilesRouter.get("/profiles/:userId", requireAuth(), async (c) => {
  const user = currentUser(c);
  return reply(c, await c.var.services.profiles.getPublicProfile(user.id, c.req.param("userId")));
});
