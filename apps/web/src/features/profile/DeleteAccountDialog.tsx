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
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Eliminar cuenta</h2>
        <p className="mt-2 text-sm text-slate-600">
          Esta acción es permanente: se borran tu perfil, tus mensajes y tu historial. Escribí{" "}
          <strong>{CONFIRM_WORD}</strong> para confirmar.
        </p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={CONFIRM_WORD}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-base uppercase sm:text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Eliminar cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
