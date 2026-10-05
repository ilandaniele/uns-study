import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, generateNonce } from "@/lib/csp";
import { CANONICAL_HOST, LEGACY_HOST } from "@/lib/hosts";

const PROXY_SECRET_HEADER = "x-sala-proxy-secret";

// The app moved from Vercel to Fly.io: send every request on the old host to the same path on
// the new one. 308 keeps the method, so a stale tab's POST isn't turned into a GET.
export function proxy(request: NextRequest) {
  if (request.headers.get("host") !== LEGACY_HOST) return forwardWithProxySecret(request);
  const url = new URL("https://" + CANONICAL_HOST);
  url.pathname = request.nextUrl.pathname;
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 308);
}

// The API trusts X-Forwarded-For only from requests carrying this shared secret (see the API's
// `proxyTrustMiddleware`). Never trust an inbound copy; add ours on the API rewrites only. Read at
// request time: it is a runtime secret, not a build arg or NEXT_PUBLIC.
// Pages also get a per-request CSP nonce: Next reads it from the request's own CSP header and
// stamps its scripts; `x-nonce` lets the root layout stamp the ones we render ourselves.
function forwardWithProxySecret(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.PROXY_SHARED_SECRET ?? "";
  const toApi = pathname.startsWith("/api/auth/") || pathname.startsWith("/api/v1/");
  const addSecret = toApi && secret !== "";
  const nonce = needsCsp(pathname) ? generateNonce() : null;
  const csp = nonce ? buildCsp(nonce) : null;
  if (!addSecret && !csp && !request.headers.has(PROXY_SECRET_HEADER)) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.delete(PROXY_SECRET_HEADER);
  if (addSecret) headers.set(PROXY_SECRET_HEADER, secret);
  if (nonce && csp) {
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
  }
  const response = NextResponse.next({ request: { headers } });
  if (csp) response.headers.set("content-security-policy", csp);
  return response;
}

const STATIC_PATH = /^\/(_next\/(static|image)\/|favicon\.ico$|sw\.js$|icons\/|.*\.(png|jpe?g|webp|svg|gif|ico|webmanifest|txt|xml)$)/;

/** Only rendered documents run scripts; skip the CSP work for static assets and the API rewrites. */
function needsCsp(pathname: string): boolean {
  return !STATIC_PATH.test(pathname) && !pathname.startsWith("/api/");
}

export const config = {
  // Static assets and the API rewrites included: nothing should keep serving from the old host.
  matcher: "/:path*",
};
