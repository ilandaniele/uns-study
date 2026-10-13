import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sala de Estudio",
    short_name: "Sala Estudio",
    description: "Disponibilidad de lugares en la sala de estudio en tiempo real.",
    start_url: "/",
    display: "standalone",
    background_color: "#fcfaf8",
    theme_color: "#ff5a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
