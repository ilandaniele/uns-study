"use client";

import { useState } from "react";

export interface MessageMenuProps {
  isOwn: boolean;
  onDelete?: () => void;
  onReport?: () => void;
  onBlock?: () => void;
}

/** Per-message "…" menu: own messages get "Eliminar"; others' get "Reportar" / "Bloquear". */
export function MessageMenu({ isOwn, onDelete, onReport, onBlock }: MessageMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Más opciones"
        className="rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        ⋮
      </button>
      {open ? (
        <>
          <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} tabIndex={-1} />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
            {isOwn ? (
              <MenuItem
                label="Eliminar"
                onClick={() => {
                  setOpen(false);
                  onDelete?.();
                }}
                danger
              />
            ) : (
              <>
                <MenuItem
                  label="Reportar"
                  onClick={() => {
                    setOpen(false);
                    onReport?.();
                  }}
                />
                <MenuItem
                  label="Bloquear"
                  onClick={() => {
                    setOpen(false);
                    onBlock?.();
                  }}
                  danger
                />
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3 py-2 text-left hover:bg-slate-50 ${danger ? "text-red-600" : "text-slate-700"}`}
    >
      {label}
    </button>
  );
}
