import { createFeedbackSchema } from "@sala/contracts";
import type { FeedbackCategory, FeedbackCreatedDto } from "@sala/contracts";
import { apiPost } from "@/lib/api";

export interface SubmitFeedbackInput {
  category: FeedbackCategory;
  message: string;
  email?: string;
  turnstileToken?: string | null;
}

/** Sends a suggestion/contact message to the admins. Empty optional fields are left out. */
export function submitFeedback(input: SubmitFeedbackInput): Promise<FeedbackCreatedDto> {
  return apiPost<FeedbackCreatedDto>("/api/v1/feedback", {
    category: input.category,
    message: input.message.trim(),
    email: input.email?.trim() || undefined,
    turnstileToken: input.turnstileToken || undefined,
  }, createFeedbackSchema);
}
