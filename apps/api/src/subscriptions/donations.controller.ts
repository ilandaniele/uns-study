import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { donationCheckoutSchema, type DonationCheckoutDto } from "@sala/contracts";
import type { Request } from "express";
import type { z } from "zod";
import { ApiErrors } from "../common/api-error.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { env } from "../env.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { MercadoPagoClient } from "./mercadopago.client.js";
import { MP_CLIENT } from "./subscriptions.service.js";

const LIMIT = 10;
const WINDOW_S = 3600;

/**
 * `/donations/checkout`: public, anonymous one-time donation. Creates a Mercado Pago Checkout Pro
 * preference for a bounded whole-peso amount and returns its URL; nothing is stored, the money goes
 * straight to the MP account. The webhook ignores `payment` events, so donations never touch user rows.
 */
@Controller("donations")
export class DonationsController {
  constructor(
    @Inject(MP_CLIENT) private readonly mp: MercadoPagoClient | null,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  @Post("checkout")
  @HttpCode(200)
  async checkout(@Req() req: Request, @Body(new ZodBodyPipe(donationCheckoutSchema)) body: z.infer<typeof donationCheckoutSchema>): Promise<DonationCheckoutDto> {
    if (!this.mp) throw ApiErrors.featureDisabled();
    const limit = await this.rateLimit.check(`donations:checkout:${req.ip ?? "unknown"}`, LIMIT, WINDOW_S);
    if (!limit.allowed) throw ApiErrors.rateLimited();

    const back = `${env.publicWebUrl}/?donacion=gracias`;
    const pref = await this.mp.createPreference({
      items: [{ title: "Donación Sala de Estudio", quantity: 1, unit_price: body.amount, currency_id: "ARS" }],
      back_urls: { success: back, failure: env.publicWebUrl, pending: back },
      auto_return: "approved",
      statement_descriptor: "SALA ESTUDIO",
    });
    return { initPoint: pref.init_point };
  }
}
