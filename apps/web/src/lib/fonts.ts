import { Archivo, Geist_Mono } from "next/font/google";

/**
 * Display face: Archivo at its expanded width, bold. Reads like the room's wayfinding signage
 * (table plates, door signs) rather than a generic app heading.
 */
export const fontDisplay = Archivo({
  subsets: ["latin"],
  weight: "variable",
  axes: ["wdth"],
  variable: "--font-display",
  display: "swap",
});

/** Body face: Archivo at normal width — same family keeps the voice consistent, legible on phones. */
export const fontBody = Archivo({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-body",
  display: "swap",
});

/** Data face: counts, times and seat numbers use tabular mono figures so they never jitter. */
export const fontMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
