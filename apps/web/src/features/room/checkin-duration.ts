import { CHECKIN_MINUTES, CHECKIN_MIN_MINUTES } from "@uns/contracts/events";

/** Quick "Hasta:" choices offered next to "Estoy acá"; the last one is the API default. */
export const CHECKIN_DURATION_CHIPS = [
  { label: "30 min", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
  { label: "3 h", minutes: CHECKIN_MINUTES },
] as const;

export const DEFAULT_CHECKIN_DURATION = CHECKIN_MINUTES;

/** Keeps a chosen duration inside what the API accepts (15..180 whole minutes). */
export function clampCheckInMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_CHECKIN_DURATION;
  return Math.min(CHECKIN_MINUTES, Math.max(CHECKIN_MIN_MINUTES, Math.round(minutes)));
}

/**
 * Minutes from `now` until the next occurrence of a "HH:MM" wall-clock time (tomorrow if it has
 * already passed today), clamped to 15..180. `null` when the text isn't a valid time.
 */
export function minutesUntilClockTime(value: string, now: Date = new Date()): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  const target = new Date(now);
  target.setHours(hours, mins, 0, 0);
  let diffMs = target.getTime() - now.getTime();
  if (diffMs < 0) diffMs += 24 * 60 * 60_000;
  return clampCheckInMinutes(diffMs / 60_000);
}

/** "HH:MM" for the `<input type="time">` value of `now + minutes`. */
export function clockTimeAfter(minutes: number, now: Date = new Date()): string {
  const t = new Date(now.getTime() + minutes * 60_000);
  return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

/** "14:32" — local time an ISO instant falls on. */
export function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
