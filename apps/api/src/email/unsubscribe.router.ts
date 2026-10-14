import { Hono } from "hono";
import type { EmailUnsubscribeStatusDto } from "@sala/contracts";
import type { Context } from "hono";
import { ApiErrors } from "../common/api-error.js";
import { env } from "../env.js";
import type { AppEnv } from "../http/context.js";
import { reply } from "../http/reply.js";
import { hashIp } from "../security/security-event.service.js";
import { verifyUnsubscribeToken } from "./unsubscribe-token.js";

function isValid(userId: string | undefined, token: string | undefined): userId is string {
  return typeof userId === "string" && typeof token === "string" && verifyUnsubscribeToken(userId, token, env.betterAuthSecret);
}

/** Public, token-authenticated. POST doubles as the RFC 8058 one-click target, so it takes query params
 *  and never reads the (form-urlencoded) body. */
export const unsubscribeRouter = new Hono<AppEnv>();

/** Read-only, so link scanners prefetching the URL never unsubscribe anyone. */
unsubscribeRouter.get("/email/unsubscribe", async (c) => {
  await throttle(c);
  const userId = c.req.query("u");
  if (!isValid(userId, c.req.query("t"))) return reply(c, { valid: false, subscribed: false } satisfies EmailUnsubscribeStatusDto);
  return reply(c, { valid: true, subscribed: await c.var.services.emailCampaigns.marketingEmailsOn(userId) } satisfies EmailUnsubscribeStatusDto);
});

unsubscribeRouter.post("/email/unsubscribe", async (c) => {
  await throttle(c);
  const userId = c.req.query("u");
  if (!isValid(userId, c.req.query("t"))) throw ApiErrors.forbidden("El enlace no es válido.");
  await c.var.services.emailCampaigns.unsubscribe(userId);
  return reply(c, { ok: true });
});

async function throttle(c: Context<AppEnv>): Promise<void> {
  const result = await c.var.services.rateLimit.check(`email-unsub:${hashIp(c.var.ip)}`, 30, 60);
  if (!result.allowed) throw ApiErrors.rateLimited();
}
