"use client";

import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { useExitTransition } from "@/lib/useExitTransition";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { CLOSE_COUNTDOWN_S } from "./ad-config";
import {
  closeHouseInterstitial,
  dropSuspendedHouseInterstitial,
  resumeSuspendedHouseInterstitial,
  suspendHouseInterstitial,
  useHouseInterstitial,
} from "./ad-overlay-store";
import { isExcludedPath } from "./ad-config";
import { HouseAd } from "./HouseAd";
import { RewardedAdButton } from "./RewardedAdButton";
import { useAdFree } from "./useAdFree";

const RING_R = 14;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Our own interstitial; it only ever wraps house ads (GAM formats draw Google's own UI).
 * It sits on top of the screen but never gates anything: the check-in runs underneath.
 */
export function HouseInterstitial() {
  const { open, placement, resumeRemaining } = useHouseInterstitial();
  const { hideAds, adFree } = useAdFree();
  const pathname = usePathname();

  // Back from the ad's CTA (e.g. "Ingresá" without subscribing): the ad returns with the countdown
  // where it was left. A visitor who subscribed meanwhile never sees it again.
  useEffect(() => {
    if (adFree) dropSuspendedHouseInterstitial();
    if (hideAds || !pathname || isExcludedPath(pathname)) return;
    resumeSuspendedHouseInterstitial(pathname);
  }, [pathname, hideAds, adFree]);

  if (!open || !placement) return null;
  return <Overlay placement={placement} startAt={resumeRemaining} />;
}

function Overlay({
  placement,
  startAt,
}: {
  placement: NonNullable<ReturnType<typeof useHouseInterstitial>["placement"]>;
  startAt?: number;
}) {
  const initial = startAt ?? CLOSE_COUNTDOWN_S;
  const [remaining, setRemaining] = useState(initial);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [filling, setFilling] = useState(false);
  const canClose = remaining <= 0;

  const close = useCallback(() => {
    trackEvent("ad_close", { placement, provider: "house" });
    closeHouseInterstitial();
  }, [placement]);
  const { closing, requestClose } = useExitTransition(close);

  // One frame after mount so the countdown ring fills from empty (hidden under reduced motion).
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setFilling(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (startAt === undefined) trackEvent("ad_impression", { placement, provider: "house" });
  }, [placement, startAt]);

  // The CTA leaves the page: mid-countdown the ad is only put aside, to come back on return.
  const onNavigate = useCallback(() => {
    if (remaining > 0) suspendHouseInterstitial(remaining, window.location.pathname);
    else close();
  }, [remaining, close]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearTimeout(id);
  }, [remaining]);

  // Focus moves into the dialog, Tab stays inside, and focus returns to the trigger on close.
  useFocusTrap(panelRef, { onEscape: canClose ? requestClose : undefined });

  return (
    // Like Moovit's app-open ad: the backdrop never closes it, only the X once the countdown ends.
    <div
      className={`${closing ? "backdrop-exit" : "backdrop-enter"} fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-6`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="house-ad-label"
        tabIndex={-1}
        className={`${closing ? "dialog-exit" : "dialog-enter"} flex h-full w-full flex-col bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] outline-none sm:h-auto sm:max-w-md sm:rounded-float sm:border sm:border-app sm:pb-6 sm:pt-4 sm:shadow-xl`}
      >
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span id="house-ad-label" className="t-label">
            Publicidad
          </span>
          {canClose ? (
            <button
              type="button"
              onClick={requestClose}
              aria-label="Cerrar anuncio"
              className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-main hover:bg-[var(--surface-2)]"
            >
              <XIcon size={20} weight="bold" aria-hidden="true" />
            </button>
          ) : (
            <span
              role="timer"
              aria-label={`Podés cerrar el anuncio en ${remaining} segundos`}
              className="relative -mr-2 grid h-11 w-11 place-items-center"
            >
              <svg aria-hidden="true" viewBox="0 0 32 32" className="absolute inset-[6px] -rotate-90">
                <circle cx="16" cy="16" r={RING_R} fill="none" strokeWidth="2.5" className="stroke-[var(--surface-2)]" />
                <circle
                  cx="16"
                  cy="16"
                  r={RING_R}
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="stroke-[var(--primary)] motion-reduce:hidden"
                  strokeDasharray={RING_C}
                  style={{
                    strokeDashoffset: filling ? 0 : (RING_C * initial) / CLOSE_COUNTDOWN_S,
                    transition: `stroke-dashoffset ${initial}s linear`,
                  }}
                />
              </svg>
              <span aria-hidden="true" className="text-xs font-bold tabular-nums text-main">
                {remaining}
              </span>
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-center py-6 sm:py-4">
          <HouseAd variant="interstitial" onNavigate={onNavigate} />
          <div className="mt-3 empty:hidden">
            <RewardedAdButton />
          </div>
        </div>
      </div>
    </div>
  );
}
