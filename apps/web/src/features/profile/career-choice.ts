import { UNS_CAREERS, findUnsCareerByName } from "@uns/contracts";

/** Select value for the "Otra" option (never collides with a career slug). */
export const OTHER_CAREER = "__other__";

export interface CareerChoice {
  /** "" (none), a career id, or `OTHER_CAREER`. */
  choice: string;
  /** Free text used when `choice === OTHER_CAREER`. */
  other: string;
}

/** Maps a saved free-text career onto the dropdown: list match -> its id, anything else -> "Otra". */
export function careerChoiceFromValue(value: string | null | undefined): CareerChoice {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return { choice: "", other: "" };
  const match = findUnsCareerByName(trimmed);
  return match ? { choice: match.id, other: "" } : { choice: OTHER_CAREER, other: trimmed };
}

/** The string to save for a dropdown state (null when empty). */
export function careerValueFromChoice({ choice, other }: CareerChoice): string | null {
  if (choice === OTHER_CAREER) return other.trim() || null;
  return UNS_CAREERS.find((career) => career.id === choice)?.name ?? null;
}
