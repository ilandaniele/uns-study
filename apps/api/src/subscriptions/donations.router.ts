import { Hono } from "hono";
import { donationCheckoutSchema, type DonationCheckoutDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { env } from "../env.js";
import type { AppEnv } from "../http/context.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";

const LIMIT = 10;
const WINDOW_S = 3600;

/**
 * `/donations/checkout`: public, anonymous one-time donation. Creates a Mercado Pago Checkout Pro
 * preference for a bounded whole-peso amount and returns its URL; nothing is stored, the money goes
 * straight to the MP account. The webhook ignores `payment` events, so donations never touch user rows.
 */
export const donationsRouter = new Hono<AppEnv>();

donationsRouter.post("/donations/checkout", zBody(donationCheckoutSchema), async (c) => {
  // `null` (feature disabled) until MP_ACCESS_TOKEN is set.
  const mp = c.var.services.mercadoPago;
  if (!mp) throw ApiErrors.featureDisabled();
  const limit = await c.var.services.rateLimit.check(`donations:checkout:${c.var.ip}`, LIMIT, WINDOW_S);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  const back = `${env.publicWebUrl}/?donacion=gracias`;
  const pref = await mp.createPreference({
    items: [{ title: "Donación Sala de Estudio", quantity: 1, unit_price: c.req.valid("json").amount, currency_id: "ARS" }],
    back_urls: { success: back, failure: env.publicWebUrl, pending: back },
    auto_return: "approved",
    statement_descriptor: "SALA ESTUDIO",
  });
  return reply(c, { initPoint: pref.init_point } satisfies DonationCheckoutDto);
});
