"use client";

import { useRef, useState } from "react";
import { useExitTransition } from "@/lib/useExitTransition";
import { useFocusTrap } from "@/lib/useFocusTrap";

const CONFIRM_WORD = "ELIMINAR";

export interface DeleteAccountDialogProps {
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation dialog for "Eliminar cuenta" — requires typing ELIMINAR to avoid accidental deletion. */
export function DeleteAccountDialog({ pending, onConfirm, onCancel }: DeleteAccountDialogProps) {
  const [value, setValue] = useState("");
  const { closing, requestClose } = useExitTransition(onCancel);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onEscape: pending ? undefined : requestClose });

  const canConfirm = value.trim().toUpperCase() === CONFIRM_WORD && !pending;

  return (
    <div className={`${closing ? "backdrop-exit" : "backdrop-enter"} fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4`}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className={`${closing ? "dialog-exit" : "dialog-enter"} w-full max-w-sm rounded-float border border-red-200 bg-surface p-5 shadow-xl`}
      >
        <h2 id="delete-title" className="t-title">Eliminar cuenta</h2>
        <p className="mt-2 text-sm text-muted">
          Esta acción es permanente: se borran tu perfil, tus mensajes y tu historial. Escribí{" "}
          <strong>{CONFIRM_WORD}</strong> para confirmar.
        </p>
        <input
          value={value}
          aria-label="Escribí ELIMINAR para confirmar"
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          placeholder={CONFIRM_WORD}
          className="mt-3 w-full rounded-control border border-app bg-surface px-3 py-2 text-base uppercase text-main sm:text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={requestClose} className="min-h-11 rounded-control border border-app px-4 py-2 text-sm font-semibold text-main hover:bg-surface-2">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="min-h-11 rounded-control bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Eliminar cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
