// Production hostnames. Analytics and Turnstile turn on only on the canonical one, so local dev and
// preview builds never report to GA4 or render a widget whose site key doesn't allow their hostname.
export const CANONICAL_HOST = "saladeestudio.com.ar";

// The www alias; the proxy redirects it to CANONICAL_HOST.
export const LEGACY_HOSTS: readonly string[] = ["www.saladeestudio.com.ar"];

export function isProductionHost(): boolean {
  return typeof window !== "undefined" && window.location.hostname === CANONICAL_HOST;
}
