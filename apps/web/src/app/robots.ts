import type { MetadataRoute } from "next";
import { IS_STAGING } from "@/lib/site-env";
import { SITE_URL } from "./sitemap";

export default function robots(): MetadataRoute.Robots {
  // The staging site must never be indexed.
  if (IS_STAGING) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    // Account, admin and unsubscribe pages are per-user; keep them out of search results.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/perfil", "/baja", "/login", "/api/", "/chat", "/u/", "/jardin", "/personas", "/mas", "/q/", "/reportar", "/recuperar", "/restablecer"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
