import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AnalyticsLoader } from "@/components/AnalyticsLoader";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "UNS Study",
  description: "Disponibilidad de lugares en la sala de estudio en tiempo real.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "UNS Study" },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 pb-14 text-slate-900 antialiased sm:pb-0">
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
