import { Module } from "@nestjs/common";
import { env } from "../env.js";
import { MercadoPagoClient } from "./mercadopago.client.js";
import { MercadoPagoWebhookController } from "./mercadopago-webhook.controller.js";
import { SubscriptionsController } from "./subscriptions.controller.js";
import { MP_CLIENT, SubscriptionsService } from "./subscriptions.service.js";

@Module({
  controllers: [SubscriptionsController, MercadoPagoWebhookController],
  providers: [
    { provide: MP_CLIENT, useFactory: () => (env.mpAccessToken ? new MercadoPagoClient(env.mpAccessToken) : null) },
    SubscriptionsService,
  ],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
