import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AdsRoot } from "@/features/ads/AdsRoot";
import { AnalyticsLoader } from "@/components/AnalyticsLoader";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { fontBody, fontDisplay, fontMono } from "@/lib/fonts";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sala de Estudio", template: "%s · Sala de Estudio" },
  description: "Disponibilidad de lugares en la sala de estudio en tiempo real.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Sala de Estudio" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceee9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1110" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme init script sets `dark` on <html> before hydration; that mismatch is intentional.
    <html
      lang="es"
      suppressHydrationWarning
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}
    >
      <head>
        {/* Applies the stored/system theme before hydration to avoid a light-mode flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-app pb-safe-14 text-main antialiased lg:pb-0">
        <OfflineBanner />
        <Header />
        {children}
        <BottomNav />
        <AdsRoot />
        <ServiceWorkerRegistration />
        <AnalyticsLoader />
      </body>
    </html>
  );
}
