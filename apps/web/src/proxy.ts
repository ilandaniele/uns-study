import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, generateNonce } from "@/lib/csp";
import { secureWebUrl } from "@/lib/hosts";

// Upgrade HTTP before serving forms: its origin/callback is rejected by OAuth and secure cookies
// cannot work there. 308 also keeps the method on legacy links without trusting forwarding headers.
export function proxy(request: NextRequest) {
  const secureUrl = secureWebUrl(request.url);
  return secureUrl ? NextResponse.redirect(secureUrl, 308) : withCsp(request);
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
