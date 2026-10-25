import { Hono } from "hono";
import { ApiErrors } from "../common/api-error.js";
import { env } from "../env.js";
import type { AppEnv } from "../http/context.js";
import { reply } from "../http/reply.js";
import { Logger } from "../platform/logger.js";
import { verifyMercadoPagoSignature } from "./mp-signature.js";

interface WebhookBody {
  type?: string;
  data?: { id?: string | number };
}

const logger = new Logger("MercadoPagoWebhook");

/** Mercado Pago notifications. Authenticated by signature, not session; state is re-fetched from MP. */
export const mercadopagoWebhookRouter = new Hono<AppEnv>();

mercadopagoWebhookRouter.post("/webhooks/mercadopago", async (c) => {
  if (!env.mpAccessToken || !env.mpWebhookSecret) throw ApiErrors.featureDisabled();

  const query = c.req.query();
  const body = (await c.req.json().catch(() => undefined)) as WebhookBody | undefined;

  const rawId = query["data.id"] ?? body?.data?.id;
  const dataId = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : undefined;
  const rawType = query.type ?? body?.type;
  const type = typeof rawType === "string" ? rawType : undefined;

  if (!verifyMercadoPagoSignature({ xSignature: c.req.header("x-signature"), xRequestId: c.req.header("x-request-id"), dataId, secret: env.mpWebhookSecret })) {
    throw ApiErrors.unauthenticated();
  }
  if (!dataId) return reply(c, { ok: true });

  try {
    if (type === "payment") await c.var.services.gardenPurchases.handlePayment(dataId);
    else await c.var.services.subscriptions.handleWebhook({ type, dataId });
  } catch (err) {
    // Rethrown so the response is 500 and Mercado Pago retries the notification.
    logger.error(`webhook ${type ?? "?"} ${dataId} failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
  return reply(c, { ok: true });
});
