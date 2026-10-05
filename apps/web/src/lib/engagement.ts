/** localStorage keys (and helpers) for "has this visitor engaged with the app yet?" signals. */

export const FIRST_CHECK_IN_KEY = "sala.firstCheckInAt";
export const FIRST_SEEN_KEY = "sala.ads.firstSeenAt";

export function hasCheckedInBefore(): boolean {
  try {
    return localStorage.getItem(FIRST_CHECK_IN_KEY) != null;
  } catch {
    // Storage unavailable: fail closed, treated as "never checked in" so no pre-check-in ad is shown.
    return false;
  }
}

export function markCheckedIn(): void {
  try {
    if (localStorage.getItem(FIRST_CHECK_IN_KEY) == null) localStorage.setItem(FIRST_CHECK_IN_KEY, new Date().toISOString());
  } catch {
    // storage unavailable: the pre-check-in ad is simply skipped
  }
}
