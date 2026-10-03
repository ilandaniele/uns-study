"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { openHouseInterstitial } from "./ad-overlay-store";
import { markShown, shouldShowAppOpen } from "./ad-policy";
import { getAdProvider } from "./ad-provider";
import { useAdFree } from "./useAdFree";

/**
 * Opens the app-open ad on the first client mount and whenever the tab returns to the
 * foreground, when the policy allows. Renders nothing itself.
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

    function onVisibility() {
      if (document.visibilityState === "visible") maybeShow();
    }

    maybeShow();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [hideAds]);

  return null;
}
