"use client";

import { useState } from "react";

const CONFIRM_WORD = "ELIMINAR";

export interface DeleteAccountDialogProps {
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation dialog for "Eliminar cuenta" — requires typing ELIMINAR to avoid accidental deletion. */
export function DeleteAccountDialog({ pending, onConfirm, onCancel }: DeleteAccountDialogProps) {
  const [value, setValue] = useState("");
  const canConfirm = value.trim().toUpperCase() === CONFIRM_WORD && !pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[14px] border border-red-200 bg-surface p-5 shadow-xl">
        <h2 className="font-display text-lg font-semibold text-main">Eliminar cuenta</h2>
        <p className="mt-2 text-sm text-muted">
          Esta acción es permanente: se borran tu perfil, tus mensajes y tu historial. Escribí{" "}
          <strong>{CONFIRM_WORD}</strong> para confirmar.
        </p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={CONFIRM_WORD}
          className="mt-3 w-full rounded-lg border border-app bg-surface px-3 py-2 text-base uppercase text-main sm:text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-app px-4 py-2 text-sm font-semibold text-main hover:bg-[var(--surface-2)]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Eliminar cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
