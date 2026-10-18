"use client";

import { MapPinIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useMemo, useRef } from "react";
import { useExitTransition } from "@/lib/useExitTransition";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { locationHelpPlatform, locationHelpSteps } from "./location-help";

export interface LocationHelpDialogProps {
  onClose: () => void;
}

/**
 * Shown when a presence-sensitive action failed because location is blocked or turned off:
 * walks the person through re-enabling it in Chrome for their device.
 */
export function LocationHelpDialog({ onClose }: LocationHelpDialogProps) {
  const reloadRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { closing, requestClose } = useExitTransition(onClose);
  const steps = useMemo(() => locationHelpSteps(locationHelpPlatform(typeof navigator === "undefined" ? "" : navigator.userAgent)), []);

  useFocusTrap(dialogRef, { initialFocus: reloadRef, onEscape: requestClose });

  return (
    <div className={`${closing ? "backdrop-exit" : "backdrop-enter"} fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4`} onClick={requestClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-help-title"
        className={`${closing ? "dialog-exit" : "dialog-enter"} max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-sheet border border-app bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-float`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="location-help-title" className="t-title flex items-center gap-2">
            <MapPinIcon aria-hidden="true" size={20} className="shrink-0 text-primary" />
            Activá tu ubicación
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-muted hover:bg-[var(--surface-2)] hover:text-main"
          >
            <XIcon aria-hidden="true" size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">
          La usamos sólo para comprobar que estás en la sala. Así la activás en Chrome:
        </p>
        <ol className="mt-4 flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm text-main">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted">{i + 1}</span>
              <span className="min-w-0 pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-col gap-2">
          <button
            ref={reloadRef}
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-control bg-primary px-4 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98]"
          >
            Ya la activé, recargar
          </button>
          <button
            type="button"
            onClick={requestClose}
            className="min-h-11 rounded-control border border-app px-4 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
