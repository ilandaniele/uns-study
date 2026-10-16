/** Build-time ad configuration. Every value is optional; with nothing set, only house ads run. */

export const GAM_REWARDED_UNIT = process.env.NEXT_PUBLIC_GAM_REWARDED_UNIT || "";
export const GAM_INTERSTITIAL_UNIT = process.env.NEXT_PUBLIC_GAM_INTERSTITIAL_UNIT || "";
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";
export const ADSENSE_SLOT_RAIL = process.env.NEXT_PUBLIC_ADSENSE_SLOT_RAIL || "";

/**
 * Minimum gap between two app-open interstitials. Every open shows one (like Moovit); the short
 * gap only stops a reload or a double trigger from stacking two ads back to back.
 */
export const APP_OPEN_CAP_MS = 60_000;
/** Time in the background after which coming back to the app counts as a new open. */
export const APP_OPEN_BACKGROUND_MS = 60_000;
/** Minimum gap between two pre-check-in overlays. */
export const PRE_CHECKIN_CAP_MS = 20 * 60_000;
/** Seconds the house overlay's close button stays hidden. */
export const CLOSE_COUNTDOWN_S = 10;
/** Ad-free window earned by watching a rewarded ad. */
export const REWARD_SNOOZE_MS = 3 * 3600_000;

/** Routes that never show ads. */
const EXCLUDED_PREFIXES = ["/admin", "/login", "/privacidad", "/terminos", "/baja", "/suscripcion", "/foco"];

/** A 160px rail only fits beside the 1280px room grid from about this viewport width. */
export const RAIL_MIN_VIEWPORT_PX = 1640;

/**
 * Routes with enough publisher content (text written for readers) to carry Google-served display
 * ads. AdSense policy forbids its ads on app-only, navigation, login, loading, empty or error
 * screens, so every other route gets house ads or nothing.
 */
const ADSENSE_CONTENT_PREFIXES = ["/comunidad", "/guias"];

export function isAdSenseContentPath(pathname: string | null | undefined): boolean {
  if (!pathname || isExcludedPath(pathname)) return false;
  return ADSENSE_CONTENT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
