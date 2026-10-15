import { z } from "zod";

/** Suggestions, concerns and bug reports any visitor sends to the admins (`/sugerencias`). */
export const FEEDBACK_CATEGORIES = ["SUGGESTION", "CONCERN", "BUG", "OTHER"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = ["OPEN", "RESOLVED"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_MESSAGE_MIN = 5;
export const FEEDBACK_MESSAGE_MAX = 2000;

export interface FeedbackCreatedDto {
  id: string;
}

export interface AdminFeedbackDto {
  id: string;
  category: FeedbackCategory;
  message: string;
  /** Address to answer to: the one typed in the form, else the signed-in sender's account email. */
  contactEmail: string | null;
  /** Null for anonymous senders or deleted accounts. */
  sender: { userId: string; name: string } | null;
  status: FeedbackStatus;
  createdAt: string;
}

export interface AdminFeedbackListDto {
  items: AdminFeedbackDto[];
}

// ---- zod ----

export const createFeedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().trim().min(FEEDBACK_MESSAGE_MIN).max(FEEDBACK_MESSAGE_MAX),
  /** Optional reply address; mostly for anonymous senders. */
  email: z.string().trim().email().max(254).optional(),
  /** Cloudflare Turnstile token; required for anonymous senders when Turnstile is enabled. */
  turnstileToken: z.string().max(4096).nullable().optional(),
});

export const feedbackStatusSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES),
});
