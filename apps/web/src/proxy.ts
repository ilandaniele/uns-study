import { NextResponse, type NextRequest } from "next/server";
import { CANONICAL_HOST, LEGACY_HOST } from "@/lib/hosts";

// The app moved from Vercel to Fly.io: send every request on the old host to the same path on
// the new one. 308 keeps the method, so a stale tab's POST isn't turned into a GET.
export function proxy(request: NextRequest) {
  if (request.headers.get("host") !== LEGACY_HOST) return NextResponse.next();
  const url = new URL("https://" + CANONICAL_HOST);
  url.pathname = request.nextUrl.pathname;
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Static assets and the API rewrites included: nothing should keep serving from the old host.
  matcher: "/:path*",
};
