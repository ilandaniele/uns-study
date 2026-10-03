// Production hostnames. Analytics and Turnstile turn on only on these, so local dev and preview
// builds never report to GA4 or render a widget whose site key doesn't allow their hostname.
export const CANONICAL_HOST = "sala-de-estudio.fly.dev";

// The previous Vercel deployment; middleware redirects it to CANONICAL_HOST.
export const LEGACY_HOST = "uns-study.vercel.app";

export function isProductionHost(): boolean {
  return typeof window !== "undefined" && window.location.hostname === CANONICAL_HOST;
}
