"use client";

import { XIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRef } from "react";
import { HOW_TO_STEPS } from "@/features/help/how-to-steps";
import { useExitTransition } from "@/lib/useExitTransition";
import { useFocusTrap } from "@/lib/useFocusTrap";

/** "Ver cómo usar la app" — a short, static walkthrough opened from the left panel. */
export function HowToUseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { closing, requestClose } = useExitTransition(onClose);

  useFocusTrap(dialogRef, { initialFocus: closeRef, onEscape: requestClose, active: open });

  if (!open) return null;

  return (
    <div className={`${closing ? "backdrop-exit" : "backdrop-enter"} fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4`} onClick={requestClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-use-title"
        className={`${closing ? "dialog-exit" : "dialog-enter"} max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-sheet border border-app bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-float`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="how-to-use-title" className="t-title">
            Cómo usar la app
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-muted hover:bg-[var(--surface-2)] hover:text-main"
          >
            <XIcon aria-hidden="true" size={18} />
          </button>
        </div>
        <ol className="mt-4 flex flex-col gap-3">
          {HOW_TO_STEPS.map((step, i) => (
            <li key={step.title} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center text-muted">
                <step.icon aria-hidden="true" size={20} weight="bold" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-main">
                  {i + 1}. {step.title}
                </p>
                <p className="text-sm text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link href="/como-usar" className="mt-4 block text-center text-sm font-semibold text-primary underline underline-offset-2">
          Ver guía completa
        </Link>
        <button
          type="button"
          onClick={requestClose}
          className="mt-3 min-h-11 w-full rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
