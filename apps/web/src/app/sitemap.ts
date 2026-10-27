import type { MetadataRoute } from "next";
import { GUIDES } from "@/features/guides/guides";

export const SITE_URL = "https://saladeestudio.com.ar";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "always", priority: 1 },
    { url: `${SITE_URL}/proyecto`, lastModified: "2026-10-26", changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/foco`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/suscripcion`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/guias`, changeFrequency: "weekly", priority: 0.8 },
    ...GUIDES.map((guide) => ({
      url: `${SITE_URL}/guias/${guide.slug}`,
      lastModified: guide.updated,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/como-usar`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/sugerencias`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacidad`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terminos`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/propiedad-intelectual`, lastModified: "2026-10-27", changeFrequency: "yearly", priority: 0.2 },
  ];
}
