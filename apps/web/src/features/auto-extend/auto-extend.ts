/** Where the preference lives; per device, like the focus settings. */
export const AUTO_EXTEND_STORAGE_KEY = "sala.auto-extend.v1";

/** The server only accepts an automatic renewal inside this window before expiry. */
export const AUTO_EXTEND_WINDOW_MS = 15 * 60_000;
/** Minimum gap between two attempts for the same check-in. */
export const AUTO_EXTEND_RETRY_MS = 5 * 60_000;
export const AUTO_EXTEND_MAX_ATTEMPTS = 3;
/** How often the runtime re-evaluates `shouldAttempt`. */
export const AUTO_EXTEND_TICK_MS = 30_000;

export interface AutoExtendPrefs {
  enabled: boolean;
}

/** Tolerant parse of the stored value; anything unexpected means "off". */
export function parseAutoExtendPrefs(raw: string | null | undefined): AutoExtendPrefs {
  if (!raw) return { enabled: false };
  try {
    const value: unknown = JSON.parse(raw);
    const enabled = typeof value === "object" && value !== null && (value as { enabled?: unknown }).enabled === true;
    return { enabled };
  } catch {
    return { enabled: false };
  }
}

export function serializeAutoExtendPrefs(prefs: AutoExtendPrefs): string {
  return JSON.stringify({ enabled: prefs.enabled });
}

export interface AttemptInput {
  now: number;
  /** Epoch ms of the check-in's expiry. */
  expiresAt: number;
  lastAttemptAt: number | null;
  attempts: number;
}

/** True when an automatic renewal should be tried now: in the window, not expired, spaced out, under the cap. */
export function shouldAttempt({ now, expiresAt, lastAttemptAt, attempts }: AttemptInput): boolean {
  if (expiresAt <= now) return false;
  if (expiresAt - now > AUTO_EXTEND_WINDOW_MS) return false;
  if (attempts >= AUTO_EXTEND_MAX_ATTEMPTS) return false;
  return lastAttemptAt == null || now - lastAttemptAt >= AUTO_EXTEND_RETRY_MS;
}
