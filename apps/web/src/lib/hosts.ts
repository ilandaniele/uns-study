// Production hostnames. Analytics and Turnstile turn on only on the canonical one, so local dev and
// preview builds never report to GA4 or render a widget whose site key doesn't allow their hostname.
export const CANONICAL_HOST = "saladeestudio.com.ar";

// The www alias; the proxy redirects it to CANONICAL_HOST.
export const LEGACY_HOSTS: readonly string[] = ["www.saladeestudio.com.ar"];

const SECURE_WEB_HOSTS: readonly string[] = [CANONICAL_HOST, "dev.saladeestudio.com.ar"];

/** Upgrade deployed URLs before rendering a form or starting OAuth; local HTTP stays usable. */
export function secureWebUrl(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  const legacy = LEGACY_HOSTS.includes(url.hostname);
  if (!legacy && !(url.protocol === "http:" && SECURE_WEB_HOSTS.includes(url.hostname))) return null;
  url.protocol = "https:";
  if (legacy) url.hostname = CANONICAL_HOST;
  url.port = "";
  return url.href;
}

export function isProductionHost(): boolean {
  return typeof window !== "undefined" && window.location.hostname === CANONICAL_HOST;
}
