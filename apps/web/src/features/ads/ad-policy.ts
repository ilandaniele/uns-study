import { APP_OPEN_CAP_MS, PRE_CHECKIN_CAP_MS, REWARD_SNOOZE_MS, isExcludedPath } from "./ad-config";

/** The slice of `Storage` the policy needs, so tests can pass a plain Map-backed fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY_FIRST_SEEN = "sala.ads.firstSeenAt";
const KEY_APP_OPEN = "sala.ads.lastAppOpenAt";
const KEY_PRE_CHECKIN = "sala.ads.lastPreCheckInAt";
const KEY_SNOOZED = "sala.ads.snoozedUntil";
const KEY_PROBE = "sala.ads.probe";

function readNumber(storage: StorageLike, key: string): number | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeNumber(storage: StorageLike, key: string, value: number): void {
  try {
    storage.setItem(key, String(value));
  } catch {
    // Storage blocked or full: the caps simply do not persist.
  }
}

/** Fail closed: with storage unavailable the caps and snooze cannot be honoured, so no ad is shown. */
function storageUsable(storage: StorageLike): boolean {
  try {
    storage.getItem(KEY_FIRST_SEEN);
    storage.setItem(KEY_PROBE, "1");
    return true;
  } catch {
    return false;
  }
}

/** Epoch ms until which ads are snoozed, or null when there is no snooze on record. */
export function getSnoozedUntil(storage: StorageLike): number | null {
  return readNumber(storage, KEY_SNOOZED);
}

function isSnoozed(now: number, storage: StorageLike): boolean {
  const until = getSnoozedUntil(storage);
  return until !== null && until > now;
}

/** Starts the reward window and returns when it ends. */
export function snooze(now: number, storage: StorageLike): number {
  const until = now + REWARD_SNOOZE_MS;
  writeNumber(storage, KEY_SNOOZED, until);
  return until;
}

export function markShown(kind: "app_open" | "pre_checkin", now: number, storage: StorageLike): void {
  writeNumber(storage, kind === "app_open" ? KEY_APP_OPEN : KEY_PRE_CHECKIN, now);
}

/**
 * The app-open ad never greets a first-time visitor: the first call only records `firstSeenAt`.
 * It is also mobile-only, skips excluded routes, and honours both the cap and the reward snooze.
 */
export function shouldShowAppOpen(args: {
  pathname: string | null | undefined;
  now: number;
  storage: StorageLike;
  isMobile: boolean;
}): boolean {
  const { pathname, now, storage, isMobile } = args;
  if (!storageUsable(storage)) return false;
  if (readNumber(storage, KEY_FIRST_SEEN) === null) {
    writeNumber(storage, KEY_FIRST_SEEN, now);
    return false;
  }
  if (isExcludedPath(pathname)) return false;
  if (!isMobile) return false;
  if (isSnoozed(now, storage)) return false;
  const last = readNumber(storage, KEY_APP_OPEN);
  if (last !== null && now - last < APP_OPEN_CAP_MS) return false;
  return true;
}

export function shouldShowPreCheckIn(args: { now: number; storage: StorageLike }): boolean {
  const { now, storage } = args;
  if (!storageUsable(storage)) return false;
  if (isSnoozed(now, storage)) return false;
  const last = readNumber(storage, KEY_PRE_CHECKIN);
  return last === null || now - last >= PRE_CHECKIN_CAP_MS;
}
