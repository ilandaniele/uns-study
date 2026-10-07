"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdSlot } from "@/components/AdSlot";
import { useMediaQuery } from "@/lib/use-media-query";
import { ADSENSE_CLIENT, ADSENSE_SLOT_RAIL, RAIL_MIN_VIEWPORT_PX, isAdSenseContentPath, isExcludedPath } from "./ad-config";
import { HouseAd } from "./HouseAd";
import { useAdFree } from "./useAdFree";

/** Two 160x600 rails flanking the page on very wide screens, where they do not cover content. */
export function SideRails() {
  const { hideAds } = useAdFree();
  const pathname = usePathname();
  const wide = useMediaQuery(`(min-width: ${RAIL_MIN_VIEWPORT_PX}px)`);

  if (hideAds || !wide || isExcludedPath(pathname)) return null;

  // Google ads only beside real publisher content; app screens (the map) get house ads.
  const useAdSense = !!ADSENSE_CLIENT && !!ADSENSE_SLOT_RAIL && isAdSenseContentPath(pathname);
  const content = useAdSense ? <AdSlot placement="rail" /> : <HouseAd variant="rail" />;

  return (
    <>
      <Rail side="left" label="Publicidad">
        {content}
      </Rail>
      <Rail side="right" label="Publicidad">
        {content}
      </Rail>
    </>
  );
}

function Rail({ side, label, children }: { side: "left" | "right"; label: string; children: ReactNode }) {
  return (
    <aside
      aria-label={label}
      className={`fixed top-[calc(50%+28px)] z-20 w-40 -translate-y-1/2 ${side === "left" ? "left-4" : "right-4"}`}
      style={{ height: "min(600px, calc(100dvh - 6rem))" }}
    >
      <span className="label-caps mb-1 block !text-[10px] text-faint">Publicidad</span>
      <div className="h-[calc(100%-1.25rem)] overflow-hidden">{children}</div>
    </aside>
  );
}
