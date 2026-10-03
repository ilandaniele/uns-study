import type { EmailCampaignDto, EmailCampaignInput, EmailConfigDto, EmailRecipientPreviewDto } from "@sala/contracts";
import { apiFetch, apiPost } from "@/lib/api";

const BASE = "/api/v1/admin/email-campaigns";

export const fetchEmailConfig = () => apiFetch<EmailConfigDto>(`${BASE}/config`);
export const fetchEmailCampaigns = () => apiFetch<EmailCampaignDto[]>(BASE);
export const fetchRecipientCount = () => apiFetch<EmailRecipientPreviewDto>(`${BASE}/recipients/count`);
export const createEmailCampaign = (input: EmailCampaignInput) => apiPost<EmailCampaignDto>(BASE, input);
export const updateEmailCampaign = (id: string, input: Partial<EmailCampaignInput>) =>
  apiFetch<EmailCampaignDto>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(input) });
/** Only called from the confirm dialog: this is what actually queues the mails for delivery. */
export const sendEmailCampaign = (id: string) => apiPost<EmailCampaignDto>(`${BASE}/${id}/send`);
