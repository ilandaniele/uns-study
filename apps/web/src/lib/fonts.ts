import { Geist, Outfit } from "next/font/google";

/** Display face: headings, hero sentence, table/pill labels. */
export const fontDisplay = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

/** Body face: everything else — chosen for legibility on phones. */
export const fontBody = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});
