"use client";

import { XIcon } from "@phosphor-icons/react/dist/ssr";

export interface SeatFreedToastProps {
  message: string;
  /** Present only for a single freed seat — a batch toast has nothing specific to jump to. */
  onView?: () => void;
  onDismiss: () => void;
}

/** Bottom-corner toast for `seat:freed-alert` — self-clears on a timer (see `useRoomAlerts`), but
 *  can also be dismissed or acted on ("Ver" selects the seat) right away. */
export function SeatFreedToast({ message, onView, onDismiss }: SeatFreedToastProps) {
  return (
    <div
      role="status"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-app bg-surface px-4 py-3 text-sm shadow-lg sm:left-auto sm:right-4 sm:translate-x-0 lg:bottom-4"
    >
      <span className="text-main">{message}</span>
      <div className="flex shrink-0 gap-2">
        {onView ? (
          <button type="button" onClick={onView} className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-dark">
            Ver
          </button>
        ) : null}
        <button type="button" onClick={onDismiss} aria-label="Cerrar" className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-[var(--surface-2)]">
          <XIcon aria-hidden="true" size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}
