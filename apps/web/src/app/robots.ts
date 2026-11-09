import type { MetadataRoute } from "next";
import { IS_STAGING } from "@/lib/site-env";
import { SITE_URL } from "./sitemap";

export default function robots(): MetadataRoute.Robots {
  // The staging site must never be indexed.
  if (IS_STAGING) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    // Limit crawling of account/API routes. /jardin must be crawled so its noindex can be read;
    // robots.txt alone cannot remove an already indexed URL from search results.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/perfil", "/baja", "/login", "/api/", "/chat", "/u/", "/personas", "/mas", "/q/", "/reportar", "/recuperar", "/restablecer"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
