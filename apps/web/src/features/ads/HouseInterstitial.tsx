"use client";

import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { useExitTransition } from "@/lib/useExitTransition";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { CLOSE_COUNTDOWN_S } from "./ad-config";
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
  const [remaining, setRemaining] = useState(CLOSE_COUNTDOWN_S);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [filling, setFilling] = useState(false);
  const canClose = remaining <= 0;

  const close = useCallback(() => {
    trackEvent("ad_close", { placement, provider: "house" });
    closeHouseInterstitial();
  }, [placement]);
  const { closing, requestClose } = useExitTransition(close);

  // One frame after mount so the bar animates from empty (transform only, hidden under reduced motion).
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setFilling(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    trackEvent("ad_impression", { placement, provider: "house" });
  }, [placement]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearTimeout(id);
  }, [remaining]);

  // Focus moves into the dialog, Tab stays inside, and focus returns to the trigger on close.
  useFocusTrap(panelRef, { onEscape: canClose ? requestClose : undefined });

  return (
    <div
      className={`${closing ? "backdrop-exit" : "backdrop-enter"} fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4`}
      onClick={canClose ? requestClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="house-ad-label"
        tabIndex={-1}
        className={`${closing ? "dialog-exit" : "dialog-enter"} w-full max-w-sm rounded-t-[22px] border border-app bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl outline-none sm:rounded-[12px]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
          <span id="house-ad-label" className="label-caps text-muted">
            Publicidad
          </span>
          {canClose ? (
            <button
              type="button"
              onClick={requestClose}
              aria-label="Cerrar anuncio"
              className="-mr-2 grid h-11 w-11 place-items-center rounded-[10px] text-main hover:bg-[var(--surface-2)]"
            >
              <XIcon size={20} weight="bold" aria-hidden="true" />
            </button>
          ) : (
            <span aria-live="off" className="text-xs font-semibold tabular-nums text-muted">
              Podés cerrar en {remaining}…
            </span>
          )}
        </div>
        <HouseAd variant="interstitial" onNavigate={close} />
        <div className="mt-3 empty:hidden">
          <RewardedAdButton />
        </div>
        <div aria-hidden="true" className="mt-4 h-[3px] overflow-hidden rounded-full bg-[var(--surface-2)] motion-reduce:hidden">
          <div
            className="h-full origin-left bg-primary"
            style={{
              transform: filling ? "scaleX(1)" : "scaleX(0)",
              transition: `transform ${CLOSE_COUNTDOWN_S}s linear`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
