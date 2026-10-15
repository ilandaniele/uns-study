import { Hono } from "hono";
import { createFeedbackSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import type { AppEnv } from "../http/context.js";
import { optionalAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";
import { hashIp } from "../security/security-event.service.js";

const LIMIT = 3;
const WINDOW_S = 600;

/**
 * `/feedback`: public suggestion/contact form. Signed-in senders skip Turnstile; anonymous ones must
 * pass it when it is enabled. The limiter window stays <= 10 minutes so it never touches SQLite.
 */
export const feedbackRouter = new Hono<AppEnv>();

feedbackRouter.post("/feedback", optionalAuth, zBody(createFeedbackSchema), async (c) => {
  const { services, ip } = c.var;
  const user = c.var.user;
  const body = c.req.valid("json");

  await services.antiAbuse.enforceRateLimit({ key: `feedback:${user?.id ?? hashIp(ip)}`, limit: LIMIT, windowSeconds: WINDOW_S });
  if (!user && services.turnstile.isEnabled() && !(await services.turnstile.verify(body.turnstileToken, ip))) {
    throw ApiErrors.turnstileRequired();
  }

  const created = await services.feedback.create({
    userId: user?.id ?? null,
    accountEmail: user?.email ?? null,
    accountEmailVerified: user?.emailVerified === true,
    accountName: user?.name ?? null,
    category: body.category,
    message: body.message,
    email: body.email,
    ipHash: user ? null : hashIp(ip),
  });
  return reply(c, created, 201);
});
