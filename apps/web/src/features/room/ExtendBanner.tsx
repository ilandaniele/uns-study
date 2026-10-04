"use client";

export interface ExtendBannerProps {
  minutesLeft: number;
  pending: boolean;
  onExtend: () => void;
  onCheckOut: () => void;
  /** True while GPS is being sampled for the extend request. */
  locating?: boolean;
}

/**
 * Non-modal "¿Seguís acá?" prompt (PRD §7), shown at the top of the room page while the
 * caller's active check-in has 5 minutes or less remaining.
 */
export function ExtendBanner({ minutesLeft, pending, onExtend, onCheckOut, locating = false }: ExtendBannerProps) {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="font-medium">¿Seguís acá? Tu lugar se libera en {minutesLeft} min.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onExtend}
          disabled={pending}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {locating ? "Buscando tu ubicación…" : "Sigo acá"}
        </button>
        <button
          type="button"
          onClick={onCheckOut}
          disabled={pending}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          Me voy
        </button>
      </div>
    </div>
  );
}
