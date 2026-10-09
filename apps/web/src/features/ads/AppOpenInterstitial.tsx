"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { APP_OPEN_BACKGROUND_MS } from "./ad-config";
import { openHouseInterstitial } from "./ad-overlay-store";
import { markShown, shouldShowAppOpen } from "./ad-policy";
import { getAdProvider } from "./ad-provider";
import { useAdFree } from "./useAdFree";

/**
 * Opens the app-open ad on every app open, when the policy allows: the first client mount, and a
 * return to the foreground after at least `APP_OPEN_BACKGROUND_MS` away (a quick app switch is
 * not a new open). Renders nothing itself.
 */
export function AppOpenInterstitial() {
  const { hideAds } = useAdFree();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    // Wait for `/me` so subscribers never see (or burn the cap on) an ad.
    if (hideAds) return;

    function maybeShow() {
      try {
        const now = Date.now();
        const storage = window.localStorage;
        const isMobile = window.matchMedia("(max-width: 1023px)").matches;
        if (!shouldShowAppOpen({ pathname: pathnameRef.current, now, storage, isMobile })) return;

        const provider = getAdProvider("interstitial");
        if (provider.id === "gam") {
          // Registration only: Google renders it on the next navigation and gpt.ts marks it shown.
          void provider
            .showInterstitial("app_open")
            .then((outcome) => {
              if (outcome === "unavailable") showHouse();
            })
            .catch(showHouse);
          return;
        }
        showHouse();
      } catch {
        // Ads are best effort.
      }
    }

    function showHouse() {
      markShown("app_open", Date.now(), window.localStorage);
      openHouseInterstitial("app_open");
    }

    let hiddenAt: number | null = null;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= APP_OPEN_BACKGROUND_MS) maybeShow();
    }

    maybeShow();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [hideAds]);

  return null;
}
