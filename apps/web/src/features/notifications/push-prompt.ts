import type { PushSupportState } from "@/lib/push";

export const PUSH_PROMPT_SNOOZE_KEY = "push-prompt-snoozed-until";
export const SNOOZE_LATER_MS = 3 * 24 * 60 * 60 * 1000;
export const SNOOZE_FAILED_MS = 30 * 24 * 60 * 60 * 1000;

/** Routes where an interruption would be unwelcome (auth flows). */
const HIDDEN_PREFIXES = ["/login", "/recuperar", "/restablecer", "/onboarding", "/baja"];

export function isPromptRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return !HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isSnoozed(until: number | null, now: number): boolean {
  return until !== null && Number.isFinite(until) && until > now;
}

export function shouldShowPushPrompt(input: {
  signedIn: boolean;
  support: PushSupportState;
  permission: NotificationPermission | "unsupported";
  hasSubscription: boolean;
  snoozedUntil: number | null;
  now: number;
  pathname: string | null;
}): boolean {
  return (
    input.signedIn &&
    input.support === "available" &&
    input.permission === "default" &&
    !input.hasSubscription &&
    !isSnoozed(input.snoozedUntil, input.now) &&
    isPromptRoute(input.pathname)
  );
}

export function readSnooze(): number | null {
  try {
    const raw = localStorage.getItem(PUSH_PROMPT_SNOOZE_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

export function writeSnooze(durationMs: number, now = Date.now()): void {
  try {
    localStorage.setItem(PUSH_PROMPT_SNOOZE_KEY, String(now + durationMs));
  } catch {
    // storage unavailable — prompt may reappear next visit
  }
}
