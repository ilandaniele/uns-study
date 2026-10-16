import type { GroupFocusDto } from "@sala/contracts";

export const FOCUS_CHIPS = [25, 50, 90] as const;
export const FOCUS_MIN_MINUTES = 5;
export const FOCUS_MAX_MINUTES = 180;

/** Milliseconds left on the shared timer, never negative; 0 for no timer or an unparseable end. */
export function remainingMs(focus: Pick<GroupFocusDto, "endsAt"> | null, now: number): number {
  if (!focus) return 0;
  const end = Date.parse(focus.endsAt);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - now);
}

/** "MM:SS", or "H:MM:SS" from one hour up. Rounds up so the display hits 00:00 only when the timer is over. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** Parses the custom-minutes input: a whole number inside 5..180, else null. */
export function parseFocusMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= FOCUS_MIN_MINUTES && n <= FOCUS_MAX_MINUTES ? n : null;
}
