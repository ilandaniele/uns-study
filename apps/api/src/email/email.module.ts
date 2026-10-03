import { Module } from "@nestjs/common";
import { env } from "../env.js";
import { AdminEmailController } from "./admin-email.controller.js";
import { EmailCampaignsService } from "./email-campaigns.service.js";
import { EmailSendJob } from "./email-send.job.js";
import { RESEND_CLIENT, ResendClient } from "./resend.client.js";
import { UnsubscribeController } from "./unsubscribe.controller.js";

@Module({
  controllers: [AdminEmailController, UnsubscribeController],
  providers: [
    EmailCampaignsService,
    EmailSendJob,
    // `null` (feature disabled) until both RESEND_API_KEY and EMAIL_FROM are set.
    { provide: RESEND_CLIENT, useFactory: (): ResendClient | null => (env.resendApiKey && env.emailFrom ? new ResendClient(env.resendApiKey) : null) },
  ],
})
export class EmailModule {}
