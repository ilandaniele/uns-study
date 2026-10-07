"use client";

import { useRef } from "react";
import { useExitTransition } from "@/lib/useExitTransition";
import { useFocusTrap } from "@/lib/useFocusTrap";

export interface ConfirmSendDialogProps {
  recipientCount: number;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Last stop before a campaign is queued: states the exact audience size and that it can't be undone. */
export function ConfirmSendDialog({ recipientCount, pending, error, onConfirm, onCancel }: ConfirmSendDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { closing, requestClose } = useExitTransition(onCancel);

  useFocusTrap(dialogRef, { initialFocus: cancelRef, onEscape: pending ? undefined : requestClose });

  return (
    <div className={`${closing ? "backdrop-exit" : "backdrop-enter"} fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4`} onClick={pending ? undefined : requestClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-send-title"
        className={`${closing ? "dialog-exit" : "dialog-enter"} w-full max-w-sm rounded-t-2xl border border-app bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-send-title" className="font-display text-lg font-semibold text-main">
          Enviar mail
        </h2>
        <p className="mt-1 text-sm text-muted">Vas a enviar este mail a {recipientCount} personas. No se puede deshacer.</p>
        {error ? <p className="mt-2 text-sm text-[var(--seat-occupied)]">{error}</p> : null}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending || recipientCount === 0}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? "Enviando…" : `Enviar a ${recipientCount} personas`}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={requestClose}
            disabled={pending}
            className="min-h-11 rounded-xl border border-app px-4 text-sm font-medium text-main hover:bg-[var(--surface-2)] disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
