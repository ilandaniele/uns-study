import { Body, Controller, Headers, HttpCode, Inject, Logger, Post, Query } from "@nestjs/common";
import { ApiErrors } from "../common/api-error.js";
import { env } from "../env.js";
import { verifyMercadoPagoSignature } from "./mp-signature.js";
import { SubscriptionsService } from "./subscriptions.service.js";

interface WebhookBody {
  type?: string;
  data?: { id?: string | number };
}

/** Mercado Pago notifications. Authenticated by signature, not session; state is re-fetched from MP. */
@Controller("webhooks/mercadopago")
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  constructor(@Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Headers("x-signature") xSignature: string | undefined,
    @Headers("x-request-id") xRequestId: string | undefined,
    @Query() query: Record<string, unknown>,
    @Body() body: WebhookBody | undefined,
  ): Promise<{ ok: true }> {
    if (!env.mpAccessToken || !env.mpWebhookSecret) throw ApiErrors.featureDisabled();

    const rawId = query["data.id"] ?? body?.data?.id;
    const dataId = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : undefined;
    const rawType = query.type ?? body?.type;
    const type = typeof rawType === "string" ? rawType : undefined;

    if (!verifyMercadoPagoSignature({ xSignature, xRequestId, dataId, secret: env.mpWebhookSecret })) {
      throw ApiErrors.unauthenticated();
    }
    if (!dataId) return { ok: true };

    try {
      await this.subscriptions.handleWebhook({ type, dataId });
    } catch (err) {
      // Rethrown so the response is 500 and Mercado Pago retries the notification.
      this.logger.error(`webhook ${type ?? "?"} ${dataId} failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
    return { ok: true };
  }
}
