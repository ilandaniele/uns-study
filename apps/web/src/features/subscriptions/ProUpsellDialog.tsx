"use client";

import { CheckIcon, CrownSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRef } from "react";
import { useExitTransition } from "@/lib/useExitTransition";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { PRO_BENEFITS, PRO_FEATURES, type ProFeatureId } from "./pro";
import { closeProUpsell, useProUpsell } from "./pro-upsell-store";
import { usePro } from "./usePro";

export function ProUpsellDialog() {
  const feature = useProUpsell();
  return feature ? <UpsellPanel feature={feature} /> : null;
}

function UpsellPanel({ feature }: { feature: ProFeatureId }) {
  const { priceArs } = usePro();
  const dismissRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { closing, requestClose } = useExitTransition(closeProUpsell);
  const info = PRO_FEATURES[feature];

  useFocusTrap(dialogRef, { initialFocus: dismissRef, onEscape: requestClose });

  return (
    <div className={`${closing ? "backdrop-exit" : "backdrop-enter"} fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4`} onClick={requestClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pro-upsell-title"
        className={`${closing ? "dialog-exit" : "dialog-enter"} w-full max-w-sm rounded-t-sheet border border-app bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-float`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-primary">
          <CrownSimpleIcon size={20} weight="fill" aria-hidden="true" />
        </span>
        <h2 id="pro-upsell-title" className="t-title mt-3">
          Desbloqueá {info.title}
        </h2>
        <p className="mt-1 text-sm text-muted">{info.description}</p>
        <p className="t-label mt-4">Con Pro también tenés:</p>
        <ul className="mt-2 space-y-1.5 text-sm text-main">
          {PRO_BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <CheckIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              {b}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">${priceArs.toLocaleString("es-AR")}/mes · cancelás cuando quieras</p>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href="/suscripcion"
            onClick={closeProUpsell}
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-4 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98]"
          >
            Hacerme Pro
          </Link>
          <button
            ref={dismissRef}
            type="button"
            onClick={requestClose}
            className="min-h-11 rounded-control border border-app px-4 text-sm font-medium text-main hover:bg-surface-2"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
