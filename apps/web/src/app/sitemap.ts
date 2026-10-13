import type { MetadataRoute } from "next";

export const SITE_URL = "https://saladeestudio.com.ar";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "always", priority: 1 },
    { url: `${SITE_URL}/foco`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/suscripcion`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/como-usar`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacidad`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terminos`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
