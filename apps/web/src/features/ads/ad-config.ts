import { PUBLISHED_GUIDE_PATHS } from "@/features/guides/published-guide-paths";

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
/**
 * Our own full-screen promo ("Quiero sacar los anuncios"). Off for now: no house overlay opens on
 * app open or before a check-in. Set back to `true` to bring it back; nothing else changes.
 */
export const HOUSE_INTERSTITIAL_ENABLED = false;
/** Seconds the house overlay's close button stays hidden. */
export const CLOSE_COUNTDOWN_S = 10;
/** Ad-free window earned by watching a rewarded ad. */
export const REWARD_SNOOZE_MS = 3 * 3600_000;

/** Routes without interruption/house/side-rail promos; inline AdSense has its own policy below. */
const EXCLUDED_PREFIXES = ["/admin", "/login", "/privacidad", "/terminos", "/propiedad-intelectual", "/baja", "/suscripcion", "/foco", "/perfil", "/proyecto", "/como-usar", "/sugerencias", "/guias"];

/** A 160px rail only fits beside the 1280px room grid from about this viewport width. */
export const RAIL_MIN_VIEWPORT_PX = 1640;

/**
 * Only known, published articles can carry an inline AdSense unit. A prefix would also admit
 * search results, an empty library and nonexistent articles rendered as 404s.
 */
const ADSENSE_ARTICLES: ReadonlySet<string> = new Set(PUBLISHED_GUIDE_PATHS);

export function isAdSenseContentPath(pathname: string | null | undefined): boolean {
  return !!pathname && ADSENSE_ARTICLES.has(pathname);
}

export type AdPlacement = "community-feed" | "rail" | "article" | "room-bottom";

export function isAdSenseAllowed(placement: AdPlacement, pathname: string | null | undefined): boolean {
  return placement === "article" && isAdSenseContentPath(pathname);
}

export function isExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
