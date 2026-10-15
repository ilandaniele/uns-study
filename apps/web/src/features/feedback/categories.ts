import { FEEDBACK_CATEGORIES, type FeedbackCategory } from "@sala/contracts";

/** Spanish labels for the feedback category choice, in display order. */
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  SUGGESTION: "Sugerencia",
  CONCERN: "Inquietud",
  BUG: "Problema o error",
  OTHER: "Otro",
};

export const FEEDBACK_CATEGORY_OPTIONS = FEEDBACK_CATEGORIES;

export function feedbackCategoryLabel(category: FeedbackCategory): string {
  return FEEDBACK_CATEGORY_LABELS[category];
}
