"use client";

import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef } from "react";

export interface MoveSeatDialogProps {
  fromLabel: string;
  toLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shown when "Estoy acá" is tapped on a new seat while the caller already holds another one.
 * Confirming moves the check-in: the API frees the old seat and occupies the new one in one step.
 */
export function MoveSeatDialog({ fromLabel, toLabel, pending, onConfirm, onCancel }: MoveSeatDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onCancel, pending]);

  return (
    <div className="backdrop-enter fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-seat-title"
        className="dialog-enter w-full max-w-sm rounded-t-2xl border border-app bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="move-seat-title" className="font-display text-lg font-semibold text-main">
          Ya tenés otro lugar marcado
        </h2>
        <p className="mt-1 text-sm text-muted">Para sentarte acá, liberamos tu lugar anterior.</p>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--surface-2)] p-3 text-sm">
          <span className="min-w-0 flex-1 truncate text-muted line-through">{fromLabel}</span>
          <ArrowRightIcon size={16} aria-hidden="true" className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate font-semibold text-main">{toLabel}</span>
        </div>
        <p className="mt-2 text-xs text-muted">{fromLabel} queda libre y {toLabel} pasa a estar ocupado por vos.</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-60"
          >
            Sí, cambiarme de lugar
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-app px-4 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
