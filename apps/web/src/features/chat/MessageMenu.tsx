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
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative rounded-lg p-1.5 text-muted before:absolute before:-inset-1.5 before:content-[''] hover:bg-[var(--surface-2)] hover:text-main"
      >
        <DotsThreeVerticalIcon aria-hidden="true" size={18} weight="bold" />
      </button>
      {open ? (
        <>
          <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} tabIndex={-1} />
          <div className="menu-enter origin-bottom-right absolute bottom-full right-0 z-20 mb-1 w-40 overflow-hidden rounded-xl border border-app bg-surface text-sm shadow-lg">
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
                {onBlock ? (
                  <MenuItem
                    label="Bloquear"
                    onClick={() => {
                      setOpen(false);
                      onBlock();
                    }}
                    danger
                  />
                ) : null}
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
