"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { type AdPlacement, isAdSenseAllowed } from "@/features/ads/ad-config";
import { useAdFree } from "@/features/ads/useAdFree";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

export type { AdPlacement };

const SLOT_BY_PLACEMENT: Record<AdPlacement, string | undefined> = {
  "community-feed": process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED,
  rail: process.env.NEXT_PUBLIC_ADSENSE_SLOT_RAIL,
  // No dedicated unit yet: articles reuse the community display unit until one is created.
  article: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE || process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED,
  "room-bottom": process.env.NEXT_PUBLIC_ADSENSE_SLOT_ROOM_BOTTOM,
};

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Renders a real AdSense ad unit when `NEXT_PUBLIC_ADSENSE_CLIENT` (and the matching slot env
 * for `placement`) is configured; renders nothing at all otherwise. The `adsbygoogle.js` loader
 * script is injected once per page via `next/script` (shared across multiple `AdSlot`s).
 */
export function AdSlot({ placement }: { placement: AdPlacement }) {
  const slot = SLOT_BY_PLACEMENT[placement];
  const { hideAds: adFree } = useAdFree();
  // Defense in depth for AdSense policy: never render a unit outside a publisher-content route.
  const pathname = usePathname();
  const hideAds = adFree || !isAdSenseAllowed(placement, pathname);
  const insRef = useRef<HTMLModElement | null>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (hideAds || !ADSENSE_CLIENT || !slot || pushed.current) return;
    try {
      window.adsbygoogle = window.adsbygoogle ?? [];
      window.adsbygoogle.push({});
      pushed.current = true;
    } catch {
      // adsbygoogle.js hasn't loaded yet (e.g. blocked); nothing to recover here.
    }
  }, [slot, hideAds]);

  if (hideAds || !ADSENSE_CLIENT || !slot) return null;

  return (
    <>
      <Script
        id="adsbygoogle-loader"
        strategy="afterInteractive"
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
        crossOrigin="anonymous"
      />
      <div data-ad-box className="min-h-[100px]">
        <ins
          ref={insRef}
          data-ad-placement={placement}
          className="adsbygoogle block"
          style={{ display: "block" }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </>
  );
}
