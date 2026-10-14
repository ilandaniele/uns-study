import { FIRST_SEEN_KEY } from "@/lib/engagement";
import { isExcludedPath } from "./ad-config";
import type { StorageLike } from "./ad-policy";

export const PROMO_LAST_SHOWN_KEY = "sala.promo.subscribe.lastShownAt";

/** Minimum gap between two promo cards. */
export const PROMO_MIN_GAP_MS = 20 * 60_000;
/** A brand-new visitor is left alone this long after the first visit (the app-open ad already pitches Pro). */
export const PROMO_NEW_VISITOR_GRACE_MS = 10 * 60_000;
/** Chance that a scheduled check actually shows the card. */
export const PROMO_CHANCE = 0.35;

const FIRST_DELAY_MIN_MS = 45_000;
const FIRST_DELAY_MAX_MS = 150_000;
const LATER_DELAY_MIN_MS = 3 * 60_000;
const LATER_DELAY_MAX_MS = 6 * 60_000;

/** Wait before the next check: 45-150 s for the first one after load, 3-6 min afterwards. */
export function nextPromoDelayMs(random: number, first: boolean): number {
  const [min, max] = first ? [FIRST_DELAY_MIN_MS, FIRST_DELAY_MAX_MS] : [LATER_DELAY_MIN_MS, LATER_DELAY_MAX_MS];
  return Math.round(min + random * (max - min));
}

function readNumber(storage: StorageLike, key: string): number | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Fails closed: any storage error means no promo. `random` is injected so tests are deterministic. */
export function shouldShowSubscribePromo(args: {
  storage: StorageLike;
  now: number;
  pathname: string | null | undefined;
  random: () => number;
}): boolean {
  const { storage, now, pathname, random } = args;
  if (isExcludedPath(pathname)) return false;
  try {
    const firstSeen = readNumber(storage, FIRST_SEEN_KEY);
    if (firstSeen === null || now - firstSeen < PROMO_NEW_VISITOR_GRACE_MS) return false;
    const last = readNumber(storage, PROMO_LAST_SHOWN_KEY);
    if (last !== null && now - last < PROMO_MIN_GAP_MS) return false;
  } catch {
    return false;
  }
  return random() < PROMO_CHANCE;
}

export function markPromoShown(storage: StorageLike, now: number): void {
  try {
    storage.setItem(PROMO_LAST_SHOWN_KEY, String(now));
  } catch {
    // Storage blocked: the gap simply does not persist.
  }
}
