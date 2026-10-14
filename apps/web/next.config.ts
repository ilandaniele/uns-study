import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Local dev only (server-only, never `NEXT_PUBLIC_*`): origin of the local API. When set, web and API
// are served from the same origin through the rewrites below, so Better Auth's session cookie stays
// first-party like in production, where Cloudflare routes `/api/*` to the API Worker.
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "";

// The Content-Security-Policy is built per request in `src/proxy.ts` (nonce), from `src/lib/csp.ts`.
// `NEXT_PUBLIC_SOCKET_URL` (dev only) is inlined by Next; production leaves it unset and the browser
// opens the realtime WebSocket on the page's own origin.

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Cloudflare Images transformations are billed per image; the app serves its images as-is.
  images: { unoptimized: true },
  transpilePackages: ["@sala/contracts"],
  async redirects() {
    // The principal room lives at "/"; old links and push notifications keep their query (?seat=).
    return [{ source: "/sala/principal", destination: "/", permanent: true }];
  },
  async headers() {
    // The service worker must never be served from a cache, or a broken one could stick around.
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Camera: report photo capture; geolocation: geofence checks.
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=()" },
          // Stop other sites from embedding our responses via <img>/<script> (Spectre-style leaks).
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  async rewrites() {
    // Local dev talks to the API directly for REST, but avatars are stored as same-origin relative
    // URLs (`/api/v1/avatars/...`) rendered in <img>, so proxy just those to the local API.
    if (!API_PROXY_TARGET) {
      const devApi = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");
      return [{ source: "/api/v1/avatars/:path*", destination: `${devApi}/api/v1/avatars/:path*` }];
    }
    const target = API_PROXY_TARGET.replace(/\/+$/, "");
    return [
      { source: "/api/auth/:path*", destination: `${target}/api/auth/:path*` },
      { source: "/api/v1/:path*", destination: `${target}/api/v1/:path*` },
    ];
  },
};

if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();

export default nextConfig;
