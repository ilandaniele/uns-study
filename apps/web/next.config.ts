import type { NextConfig } from "next";

// Server-only env (never `NEXT_PUBLIC_*`): the Render/Railway URL of the API, when web and API are
// proxied through the same origin so Better Auth's session cookie stays first-party (Safari/iOS
// block third-party `SameSite=None` cookies). Left unset in local dev, where the web app talks to
// the API directly via `NEXT_PUBLIC_API_URL`.
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "";

const nextConfig: NextConfig = {
  transpilePackages: ["@uns/contracts"],
  async rewrites() {
    if (!API_PROXY_TARGET) return [];
    const target = API_PROXY_TARGET.replace(/\/+$/, "");
    return [
      { source: "/api/auth/:path*", destination: `${target}/api/auth/:path*` },
      { source: "/api/v1/:path*", destination: `${target}/api/v1/:path*` },
    ];
  },
};

export default nextConfig;
