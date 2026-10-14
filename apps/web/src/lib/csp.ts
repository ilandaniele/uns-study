import { CANONICAL_HOST } from "@/lib/hosts";

// Content-Security-Policy, built per request in `proxy.ts` so `script-src` can carry a nonce.
// Third-party hosts the app really loads: AdSense (pagead2, plus its adtrafficquality.google
// ad-quality checks), GPT/GAM (securepubads), gtag, Turnstile.
// With 'strict-dynamic' a modern browser ignores the host list and 'self' and trusts only the nonce
// (plus scripts those scripts load); the hosts stay as the fallback for browsers without it.

/** connect-src origins for the realtime WebSocket host (https + wss, or http + ws for local dev). */
function socketOrigins(socketUrl: string): string[] {
  try {
    const { protocol, host } = new URL(socketUrl);
    return protocol === "https:" ? [`https://${host}`, `wss://${host}`] : [`http://${host}`, `ws://${host}`];
  } catch {
    return [];
  }
}

/** Production realtime is same-origin; `'self'` does not cover `wss:` in every browser, so list it. */
function realtimeOrigins(isDev: boolean): string[] {
  if (!isDev) return [`wss://${CANONICAL_HOST}`];
  return socketOrigins(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000");
}

/** Fresh unguessable nonce: 128 random bits, base64. */
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

/** In dev the realtime origin comes from `NEXT_PUBLIC_SOCKET_URL` (inlined at build time, see `next.config.ts`). */
export function buildCsp(nonce: string, isDev: boolean = process.env.NODE_ENV !== "production"): string {
  // Dev needs 'unsafe-eval' for React Refresh.
  const devEval = isDev ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval} https://pagead2.googlesyndication.com https://securepubads.g.doubleclick.net https://www.googletagmanager.com https://challenges.cloudflare.com https://*.googlesyndication.com https://*.google.com https://*.adtrafficquality.google`,
    `connect-src 'self' ${realtimeOrigins(isDev).join(" ")} https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.doubleclick.net https://*.googlesyndication.com https://*.google.com https://*.adtrafficquality.google https://challenges.cloudflare.com`,
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "frame-src https://challenges.cloudflare.com https://*.doubleclick.net https://*.googlesyndication.com https://*.google.com https://*.adtrafficquality.google https://*.mercadopago.com https://*.mercadopago.com.ar https://*.mercadolibre.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
