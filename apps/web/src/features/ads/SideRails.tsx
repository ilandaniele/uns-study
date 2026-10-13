"use client";

import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
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
  // Closing a rail hides it until the next page load.
  const [closed, setClosed] = useState({ left: false, right: false });

  if (hideAds || !wide || isExcludedPath(pathname)) return null;

  // Google ads only beside real publisher content; app screens (the map) get house ads.
  const useAdSense = !!ADSENSE_CLIENT && !!ADSENSE_SLOT_RAIL && isAdSenseContentPath(pathname);
  const content = useAdSense ? <AdSlot placement="rail" /> : <HouseAd variant="rail" />;

  return (
    <>
      {closed.left ? null : (
        <Rail side="left" label="Publicidad" onClose={() => setClosed((c) => ({ ...c, left: true }))}>
          {content}
        </Rail>
      )}
      {closed.right ? null : (
        <Rail side="right" label="Publicidad" onClose={() => setClosed((c) => ({ ...c, right: true }))}>
          {content}
        </Rail>
      )}
    </>
  );
}

function Rail({ side, label, onClose, children }: { side: "left" | "right"; label: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside
      aria-label={label}
      className={`fixed top-[calc(50%+28px)] z-20 w-40 -translate-y-1/2 ${side === "left" ? "left-4" : "right-4"}`}
      style={{ height: "min(600px, calc(100dvh - 6rem))" }}
    >
      <div className="mb-1 flex h-5 items-center justify-between">
        <span className="label-caps !text-[10px] text-faint">Publicidad</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar anuncio"
          className="-mr-1 grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-[var(--surface-2)] hover:text-main"
        >
          <XIcon size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <div className="h-[calc(100%-1.25rem)] overflow-hidden">{children}</div>
    </aside>
  );
}
