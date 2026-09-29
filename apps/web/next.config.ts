import type { NextConfig } from "next";

// Server-only env (never `NEXT_PUBLIC_*`, set in Vercel: https://uns-study-api.fly.dev): the Fly.io URL of the API, when web and API are
// proxied through the same origin so Better Auth's session cookie stays first-party (Safari/iOS
// block third-party `SameSite=None` cookies). Left unset in local dev, where the web app talks to
// the API directly via `NEXT_PUBLIC_API_URL`.
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "";

const nextConfig: NextConfig = {
  transpilePackages: ["@uns/contracts"],
  // Socket.IO can't go through the rewrites below, so the browser connects to the API host
  // directly. Default it to the proxy target so one env var configures both.
  env: {
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || API_PROXY_TARGET.replace(/\/+$/, "") || "http://localhost:4000",
  },
  async headers() {
    // The service worker must never be served from a cache, or a broken one could stick around.
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
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
