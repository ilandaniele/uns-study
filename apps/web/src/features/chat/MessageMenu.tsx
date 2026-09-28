"use client";

import { DotsThreeVerticalIcon } from "@phosphor-icons/react/dist/ssr";
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
        className="rounded-full p-1.5 text-muted hover:bg-[var(--surface-2)] hover:text-main"
      >
        <DotsThreeVerticalIcon aria-hidden="true" size={18} weight="bold" />
      </button>
      {open ? (
        <>
          <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} tabIndex={-1} />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-app bg-surface text-sm shadow-lg">
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
      className={`block w-full px-3 py-2 text-left hover:bg-[var(--surface-2)] ${danger ? "text-red-600" : "text-main"}`}
    >
      {label}
    </button>
  );
}
