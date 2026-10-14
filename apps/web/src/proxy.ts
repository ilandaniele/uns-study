import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, generateNonce } from "@/lib/csp";
import { CANONICAL_HOST, LEGACY_HOSTS } from "@/lib/hosts";

// Send every request on an old host (www) to the same path on the canonical domain. 308 keeps
// the method, so a stale tab's POST isn't turned into a GET.
export function proxy(request: NextRequest) {
  if (!LEGACY_HOSTS.includes(request.headers.get("host") ?? "")) return withCsp(request);
  const url = new URL("https://" + CANONICAL_HOST);
  url.pathname = request.nextUrl.pathname;
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 308);
}

// Pages get a per-request CSP nonce: Next reads it from the request's own CSP header and
// stamps its scripts; `x-nonce` lets the root layout stamp the ones we render ourselves.
function withCsp(request: NextRequest) {
  if (!needsCsp(request.nextUrl.pathname)) return NextResponse.next();
  const nonce = generateNonce();
  const csp = buildCsp(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

const STATIC_PATH = /^\/(_next\/(static|image)\/|favicon\.ico$|sw\.js$|icons\/|.*\.(png|jpe?g|webp|svg|gif|ico|webmanifest|txt|xml)$)/;

/** Only rendered documents run scripts; skip the CSP work for static assets and the API. */
function needsCsp(pathname: string): boolean {
  return !STATIC_PATH.test(pathname) && !pathname.startsWith("/api/");
}

export const config = {
  // Static assets included: nothing should keep serving from the www host.
  matcher: "/:path*",
};
