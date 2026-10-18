"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { SeatFreedToast } from "@/features/room/SeatFreedToast";
import { markSeatsToastMessage, selectionLabel, type MarkSeatsStatus } from "./mark-seats";

const TOAST_MS = 8_000;

export interface AdminMultiSelectBarProps {
  roomSlug: string;
  seatIds: ReadonlySet<string>;
  onClear: () => void;
  onClose: () => void;
  /** Called after a successful mark so the caller can refetch (the socket also updates the map). */
  onDone?: () => void;
}

/** Admin-only bar shown while picking seats on the map: marks every chosen seat OCCUPIED or FREE at once. The API re-checks the role. */
export function AdminMultiSelectBar({ roomSlug, seatIds, onClear, onClose, onDone }: AdminMultiSelectBarProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [message]);

  const count = seatIds.size;

  async function mark(status: MarkSeatsStatus) {
    setPending(true);
    setError(null);
    try {
      const result = await apiFetch<{ count: number; skipped: number }>(`/api/v1/admin/rooms/${roomSlug}/mark-seats`, {
        method: "POST",
        body: JSON.stringify({ seatIds: [...seatIds], status }),
      });
      setMessage(markSeatsToastMessage(status, result.count, result.skipped));
      onClear();
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "No pudimos completar la acción. Probá de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div
        role="region"
        aria-label="Selección de varios lugares"
        className="sheet-enter fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 rounded-t-sheet border-t border-app bg-surface px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_24px_rgba(0,0,0,0.18)] lg:inset-x-auto lg:bottom-4 lg:right-4 lg:w-96 lg:rounded-float lg:border"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-main" aria-live="polite">
            {selectionLabel(count)}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onClear}
              disabled={pending || count === 0}
              className="min-h-9 rounded-control px-2 text-xs font-medium text-muted hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="min-h-9 rounded-control px-2 text-xs font-medium text-muted hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              Terminar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void mark("OCCUPIED")}
            disabled={pending || count === 0}
            className="min-h-11 rounded-control bg-primary px-3 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-60"
          >
            Marcar ocupados
          </button>
          <button
            type="button"
            onClick={() => void mark("FREE")}
            disabled={pending || count === 0}
            className="min-h-11 rounded-control border border-app px-3 text-sm font-semibold text-main transition-transform duration-150 ease-out hover:bg-[var(--surface-2)] active:scale-[0.98] disabled:opacity-60"
          >
            Marcar libres
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        ) : null}
      </div>
      {message ? <SeatFreedToast message={message} onDismiss={() => setMessage(null)} /> : null}
    </>
  );
}
