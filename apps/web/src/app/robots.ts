import type { MetadataRoute } from "next";
import { SITE_URL } from "./sitemap";

export default function robots(): MetadataRoute.Robots {
  return {
    // Account, admin and unsubscribe pages are per-user; keep them out of search results.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/perfil", "/baja", "/login", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
