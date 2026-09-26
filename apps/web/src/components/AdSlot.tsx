"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

export type AdPlacement = "room-bottom" | "community-feed";

const SLOT_BY_PLACEMENT: Record<AdPlacement, string | undefined> = {
  "room-bottom": process.env.NEXT_PUBLIC_ADSENSE_SLOT_ROOM_BOTTOM,
  "community-feed": process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED,
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
  const insRef = useRef<HTMLModElement | null>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!ADSENSE_CLIENT || !slot || pushed.current) return;
    try {
      window.adsbygoogle = window.adsbygoogle ?? [];
      window.adsbygoogle.push({});
      pushed.current = true;
    } catch {
      // adsbygoogle.js hasn't loaded yet (e.g. blocked); nothing to recover here.
    }
  }, [slot]);

  if (!ADSENSE_CLIENT || !slot) return null;

  return (
    <>
      <Script
        id="adsbygoogle-loader"
        strategy="afterInteractive"
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
        crossOrigin="anonymous"
      />
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
    </>
  );
}
