import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AchievementRuntime } from "@/features/badges/AchievementRuntime";
import { AdsRoot } from "@/features/ads/AdsRoot";
import { AnalyticsLoader } from "@/components/AnalyticsLoader";
import { BottomNav } from "@/components/BottomNav";
import { NavigationTracker } from "@/components/NavigationTracker";
import { ChatLauncher } from "@/features/chat/ChatLauncher";
import { Header } from "@/components/Header";
import { EmailVerificationNotice } from "@/features/auth/EmailVerificationNotice";
import { VoteNotification } from "@/features/room/VoteNotification";
import { AutoExtendRuntime } from "@/features/auto-extend/AutoExtendRuntime";
import { FocusRuntime } from "@/features/focus/FocusRuntime";
import { StudyPresenceRuntime } from "@/features/presence/StudyPresenceRuntime";
import { ProUpsellDialog } from "@/features/subscriptions/ProUpsellDialog";
import { PushPermissionPrompt } from "@/features/notifications/PushPermissionPrompt";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { fontDisplay, fontMono } from "@/lib/fonts";
import { IS_STAGING } from "@/lib/site-env";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { SITE_URL } from "./sitemap";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sala de Estudio", template: "%s · Sala de Estudio" },
  description: "Disponibilidad de lugares en la sala de estudio en tiempo real.",
  manifest: "/manifest.webmanifest",
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icons/icon-192.png", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Sala de Estudio",
    locale: "es_AR",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Sala de Estudio" },
  ...(IS_STAGING ? { robots: { index: false, follow: false } } : {}),
  // Lets AdSense verify site ownership without loading the ad script on every page.
  ...(process.env.NEXT_PUBLIC_ADSENSE_CLIENT
    ? { other: { "google-adsense-account": process.env.NEXT_PUBLIC_ADSENSE_CLIENT } }
    : {}),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#101714" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Per-request CSP nonce from `proxy.ts`; this makes every page dynamically rendered.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // The theme init script sets `dark` on <html> before hydration; that mismatch is intentional.
    <html
      lang="es"
      suppressHydrationWarning
      className={`${fontDisplay.variable} ${fontMono.variable}`}
    >
      <head>
        {/* Applies the stored/system theme before hydration to avoid a light-mode flash. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-app pb-safe-28 text-main antialiased lg:pb-24">
        {IS_STAGING ? (
          <div className="room-staging-banner bg-amber-400 px-4 py-1 text-center text-xs font-semibold text-black">
            Sitio de prueba: los datos no son reales y pueden borrarse.
          </div>
        ) : null}
        <OfflineBanner />
        <Header />
        <EmailVerificationNotice />
        <StudyPresenceRuntime />
        {children}
        <ChatLauncher />
        <BottomNav />
        <NavigationTracker />
        <FocusRuntime />
        <AutoExtendRuntime />
        <VoteNotification />
        <AchievementRuntime />
        <ProUpsellDialog />
        <PushPermissionPrompt />
        <AdsRoot />
        <ServiceWorkerRegistration />
        <AnalyticsLoader />
      </body>
    </html>
  );
}
