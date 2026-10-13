"use client";

import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";
import { useExitTransition } from "@/lib/useExitTransition";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { closeHouseInterstitial, useHouseInterstitial } from "./ad-overlay-store";
import { HouseAd } from "./HouseAd";
import { RewardedAdButton } from "./RewardedAdButton";

/**
 * Our own interstitial; it only ever wraps house ads (GAM formats draw Google's own UI).
 * It sits on top of the screen but never gates anything: the check-in runs underneath.
 */
export function HouseInterstitial() {
  const { open, placement } = useHouseInterstitial();
  if (!open || !placement) return null;
  return <Overlay placement={placement} />;
}

function Overlay({ placement }: { placement: NonNullable<ReturnType<typeof useHouseInterstitial>["placement"]> }) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    trackEvent("ad_close", { placement, provider: "house" });
    closeHouseInterstitial();
  }, [placement]);
  const { closing, requestClose } = useExitTransition(close);

  useEffect(() => {
    trackEvent("ad_impression", { placement, provider: "house" });
  }, [placement]);

  // Focus moves into the dialog, Tab stays inside, and focus returns to the trigger on close.
  useFocusTrap(panelRef, { onEscape: requestClose });

  return (
    // The X closes it right away; so do Escape and a tap on the backdrop (desktop, where it shows).
    <div
      onClick={requestClose}
      className={`${closing ? "backdrop-exit" : "backdrop-enter"} fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-6`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="house-ad-label"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`${closing ? "dialog-exit" : "dialog-enter"} flex h-full w-full flex-col bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] outline-none sm:h-auto sm:max-w-md sm:rounded-float sm:border sm:border-app sm:pb-6 sm:pt-4 sm:shadow-xl`}
      >
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span id="house-ad-label" className="t-label">
            Publicidad
          </span>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Cerrar anuncio"
            className="-mr-2 grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)] text-main hover:bg-[var(--border-strong)]"
          >
            <XIcon size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-1 flex-col justify-center py-6 sm:py-4">
          <HouseAd variant="interstitial" onNavigate={close} />
          <div className="mt-3 empty:hidden">
            <RewardedAdButton />
          </div>
        </div>
      </div>
    </div>
  );
}
