import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AnalyticsLoader } from "@/components/AnalyticsLoader";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sala de Estudio UNS", template: "%s · Sala de Estudio UNS" },
  description: "Disponibilidad de lugares en la sala de estudio en tiempo real.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Sala de Estudio UNS" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4f46e5" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme init script sets `dark` on <html> before hydration; that mismatch is intentional.
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Applies the stored/system theme before hydration to avoid a light-mode flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-slate-50 pb-safe-14 text-slate-900 antialiased sm:pb-0">
        <OfflineBanner />
        <Header />
        {children}
        <BottomNav />
        <ServiceWorkerRegistration />
        <AnalyticsLoader />
      </body>
    </html>
  );
}
