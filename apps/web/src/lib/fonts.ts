import localFont from "next/font/local";

// Self-hosted (OFL, licenses next to the files) so builds never fetch from Google Fonts.

/**
 * Display face: Archivo at its expanded width, bold. Reads like the room's wayfinding signage
 * (table plates, door signs) rather than a generic app heading. Also the body face (one font
 * file, normal width at the default `font-stretch`), exposed to CSS as `--font-display`.
 */
export const fontDisplay = localFont({
  src: "../fonts/Archivo-Variable.woff2",
  weight: "100 900",
  style: "normal",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  variable: "--font-display",
  display: "swap",
});

/** Data face: counts, times and seat numbers use tabular mono figures so they never jitter. */
export const fontMono = localFont({
  src: "../fonts/GeistMono-Variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-mono",
  display: "swap",
});
