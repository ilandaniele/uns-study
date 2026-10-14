import { Hono } from "hono";
import { pushSubscriptionSchema, unsubscribePushSchema, type VapidPublicKeyDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { env } from "../env.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

export const pushSubscriptionsRouter = new Hono<AppEnv>();

/** Public — the web app needs this before it knows whether the visitor is signed in. */
pushSubscriptionsRouter.get("/notifications/vapid-public-key", (c) => {
  const dto: VapidPublicKeyDto = { publicKey: env.vapidPublicKey };
  return reply(c, dto);
});

pushSubscriptionsRouter.post("/notifications/push-subscriptions", requireAuth(), zBody(pushSubscriptionSchema), async (c) => {
  const user = currentUser(c);
  const limit = await c.var.services.rateLimit.check(`push-sub:${user.id}`, 10, 3600);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  await c.var.services.pushSubscriptions.subscribe(user.id, c.req.valid("json"), c.req.header("user-agent") ?? null);
  return reply(c, { ok: true }, 201);
});

/**
 * Sends a test notification to the caller's own devices, so anyone can check that push works on
 * their phone without a second account. Returns per-device counts, never endpoints.
 */
pushSubscriptionsRouter.post("/notifications/push-subscriptions/test", requireAuth(), async (c) => {
  const user = currentUser(c);
  const limit = await c.var.services.rateLimit.check(`push-test:${user.id}`, 5, 600);
  if (!limit.allowed) throw ApiErrors.rateLimited();
  const summary = await c.var.services.push.sendToUser(user.id, {
    title: "Notificación de prueba",
    body: "Si ves esto, las notificaciones funcionan en este dispositivo.",
    url: "/perfil",
    tag: "push-test",
  });
  return reply(c, summary ?? { devices: 0, accepted: 0, gone: 0, failed: 0, unconfigured: true }, 201);
});

pushSubscriptionsRouter.delete("/notifications/push-subscriptions", requireAuth(), zBody(unsubscribePushSchema), async (c) => {
  const user = currentUser(c);
  await c.var.services.pushSubscriptions.unsubscribe(user.id, c.req.valid("json").endpoint);
  return reply(c, { ok: true });
});
