"use client";

import { CrownSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { shouldShowHowToOnFirstVisit } from "@/features/help/how-to-seen";
import { useMe } from "@/lib/me-store";
import { isExcludedPath } from "./ad-config";
import { useHouseInterstitial } from "./ad-overlay-store";
import { useOtherPromptOpen, usePublishPrompt } from "./prompt-store";
import { markPromoShown, nextPromoDelayMs, shouldShowSubscribePromo } from "./subscribe-promo-policy";
import { useAdFree } from "./useAdFree";

/**
 * Occasional, small card inviting free users to go Pro. Random and rare on purpose: the app-open
 * house ad already pitches the subscription, so this never shows to new visitors or beside that ad.
 */
export function SubscribePromo() {
  const { me } = useMe();
  const { hideAds } = useAdFree();
  const { open: interstitialOpen } = useHouseInterstitial();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  const otherPromptOpen = useOtherPromptOpen("subscribe-promo");

  const eligible =
    !!me?.subscriptionsEnabled && !hideAds && !interstitialOpen && !otherPromptOpen && !isExcludedPath(pathname);
  usePublishPrompt("subscribe-promo", visible && eligible);

  useEffect(() => {
    if (!eligible) return;
    let timer = 0;
    let first = true;
    const schedule = () => {
      timer = window.setTimeout(() => {
        // While the first-visit guide is still pending, stay quiet and try again later.
        if (!shouldShowHowToOnFirstVisit()) {
          try {
            const now = Date.now();
            if (shouldShowSubscribePromo({ storage: window.localStorage, now, pathname, random: Math.random })) {
              markPromoShown(window.localStorage, now);
              setVisible(true);
              return;
            }
          } catch {
            return;
          }
        }
        schedule();
      }, nextPromoDelayMs(Math.random(), first));
      first = false;
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [eligible, pathname]);

  if (!visible || !eligible) return null;

  const priceLabel = `$${(me?.subscriptionPriceArs ?? 1500).toLocaleString("es-AR")}/mes`;

  return (
    <aside
      aria-label="Suscripción Pro"
      className="toast-enter fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 flex flex-col gap-3 rounded-float border border-app bg-surface p-4 shadow-lg lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-full lg:max-w-sm"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-primary text-white">
          <CrownSimpleIcon size={22} weight="bold" />
        </span>
        <h2 className="t-title">Pasate a Pro</h2>
      </div>
      <p className="text-sm leading-relaxed text-muted">
        Sin anuncios, aviso de lugar libre, pronóstico, estudio en grupo, historial y todo Foco. {priceLabel}.
      </p>
      <div className="flex gap-2">
        <Link
          href="/suscripcion"
          onClick={() => setVisible(false)}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control bg-primary px-3.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Ver Pro
        </Link>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="min-h-11 rounded-control px-3.5 text-sm font-semibold text-muted hover:bg-[var(--surface-2)] hover:text-main"
        >
          Ahora no
        </button>
      </div>
    </aside>
  );
}
