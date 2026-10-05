import path from "node:path";
import type { NextConfig } from "next";

// Server-only build-time env (never `NEXT_PUBLIC_*`; baked in by Dockerfile.web): the Fly.io URL of the API, when web and API are
// proxied through the same origin so Better Auth's session cookie stays first-party (Safari/iOS
// block third-party `SameSite=None` cookies). Left unset in local dev, where the web app talks to
// the API directly via `NEXT_PUBLIC_API_URL`.
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "";

// The Content-Security-Policy is built per request in `src/proxy.ts` (nonce), from `src/lib/csp.ts`.
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || API_PROXY_TARGET.replace(/\/+$/, "") || "http://localhost:4000";

const nextConfig: NextConfig = {
  // Dockerfile.web builds the self-contained server; trace files from the monorepo root so the
  // workspace packages land in the standalone bundle.
  ...(process.env.NEXT_OUTPUT_STANDALONE
    ? { output: "standalone" as const, outputFileTracingRoot: path.join(import.meta.dirname, "../..") }
    : {}),
  transpilePackages: ["@sala/contracts"],
  // Socket.IO can't go through the rewrites below, so the browser connects to the API host
  // directly. Default it to the proxy target so one env var configures both.
  env: {
    NEXT_PUBLIC_SOCKET_URL: SOCKET_URL,
  },
  async redirects() {
    return [{ source: "/", destination: "/sala/principal", permanent: false }];
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

export default nextConfig;
