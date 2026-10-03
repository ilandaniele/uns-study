import { z } from "zod";

export type EmailCampaignStatus = "draft" | "sending" | "sent";

export interface EmailCampaignDto {
  id: string;
  subject: string;
  bodyText: string;
  status: EmailCampaignStatus;
  createdBy: string | null;
  createdAt: string;
  sentAt: string | null;
  recipientCount: number | null;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
}

export const emailCampaignInputSchema = z.object({
  subject: z.string().trim().min(1).max(150),
  bodyText: z.string().trim().min(1).max(10_000),
});
export type EmailCampaignInput = z.infer<typeof emailCampaignInputSchema>;

/** `enabled` = Boolean(RESEND_API_KEY && EMAIL_FROM). */
export interface EmailConfigDto {
  enabled: boolean;
}

export interface EmailRecipientPreviewDto {
  recipientCount: number;
}

export interface EmailUnsubscribeStatusDto {
  valid: boolean;
  subscribed: boolean;
}
