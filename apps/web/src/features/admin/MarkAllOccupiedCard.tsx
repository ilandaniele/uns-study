"use client";

import type { AdminMarkAllUndoDto, SeatDto } from "@sala/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { useMe } from "@/lib/me-store";
import { useExitTransition } from "@/lib/useExitTransition";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { SeatFreedToast } from "@/features/room/SeatFreedToast";
import {
  confirmMessage,
  countMarkableSeats,
  durationLabel,
  markedToastMessage,
  MARK_ALL_OCCUPIED_DEFAULT_MINUTES,
  MARK_ALL_OCCUPIED_DURATIONS,
} from "./mark-all-occupied";

const TOAST_MS = 8_000;

export interface MarkAllOccupiedCardProps {
  roomSlug: string;
  seats: Pick<SeatDto, "status">[];
  /** Called after a successful mark/undo so the caller can refetch (the socket also updates the map). */
  onDone?: () => void;
  /** Enters map multi-select so the admin can mark chosen seats; omitted hides the button. */
  onStartMultiSelect?: () => void;
  selecting?: boolean;
  onNotice?: (message: string) => void;
}

/** Admin-only bulk action: mark every non-occupied seat as OCCUPIED for a while, or undo it. The API re-checks the role. */
export function MarkAllOccupiedCard({ roomSlug, seats, onDone, onStartMultiSelect, selecting = false, onNotice }: MarkAllOccupiedCardProps) {
  const [confirming, setConfirming] = useState(false);
  const { closing, requestClose } = useExitTransition(() => setConfirming(false));
  const [minutes, setMinutes] = useState<number>(MARK_ALL_OCCUPIED_DEFAULT_MINUTES);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { me } = useMe();
  const actorId = me?.user?.id;
  const [undoState, setUndoState] = useState<{ actorId: string; action: AdminMarkAllUndoDto | null } | null>(null);
  const undo = undoState?.actorId === actorId ? undoState?.action : null;
  const busy = useRef(false);
  const refreshUndo = useCallback(async () => {
    if (!actorId) return;
    try {
      const action = await apiFetch<AdminMarkAllUndoDto | null>(`/api/v1/admin/rooms/${roomSlug}/mark-all-occupied/undo`, { cache: "no-store" });
      setUndoState({ actorId, action });
    } catch { setUndoState({ actorId, action: null }); }
  }, [actorId, roomSlug]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial server read; updates only after I/O
    void refreshUndo();
    window.addEventListener("focus", refreshUndo);
    return () => window.removeEventListener("focus", refreshUndo);
  }, [refreshUndo]);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { active: confirming, onEscape: pending ? undefined : requestClose });

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [message]);

  const count = countMarkableSeats(seats);

  async function run<T>(path: string, body: object | undefined, toMessage: (result: T) => string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await apiFetch<T>(`/api/v1/admin/rooms/${roomSlug}/${path}`, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (confirming) requestClose();
      if (onNotice) onNotice(toMessage(result)); else setMessage(toMessage(result));
      setUndoState(null);
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "No pudimos completar la acción. Probá de nuevo.");
    } finally {
      void refreshUndo();
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-app pt-3">
      <h2 className="text-sm font-semibold text-main">Administración</h2>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          disabled={pending || selecting || count === 0}
          className="min-h-10 rounded-control bg-primary px-3 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-60"
        >
          Todos los lugares ocupados
        </button>
        <button
          type="button"
          onClick={() => { if (undo) void run<{ count: number }>("mark-all-occupied/undo", { actionId: undo.actionId }, r => r.count ? `Deshicimos el marcado total en ${r.count} lugares. Conservamos las marcas anteriores.` : "Ese marcado ya no tiene cambios para deshacer."); }}
          disabled={pending || selecting || !undo}
          className="min-h-10 rounded-control border border-app px-3 text-sm font-medium text-main hover:bg-[var(--surface-2)] disabled:opacity-60"
        >
          Deshacer marcado total
        </button>
        {onStartMultiSelect ? (
          <button
            type="button"
            data-admin-multi-start=""
            onClick={onStartMultiSelect}
            disabled={pending || selecting}
            className="min-h-10 rounded-control border border-app px-3 text-sm font-medium text-main hover:bg-[var(--surface-2)] disabled:opacity-60"
          >
            Elegir varios lugares
          </button>
        ) : null}
      </div>
      {undo ? <p className="text-xs leading-relaxed text-muted">Deshacer revierte sólo tu último marcado total; conserva las marcas previas y los cambios posteriores.</p> : null}
      {error && !confirming ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {confirming ? (
        <div className={`${closing ? "backdrop-exit" : "backdrop-enter"} fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4`} onClick={requestClose}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mark-all-title"
            tabIndex={-1}
            className={`${closing ? "dialog-exit" : "dialog-enter"} w-full max-w-sm rounded-t-sheet border border-app bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-float`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mark-all-title" className="t-title">
              Todos los lugares ocupados
            </h2>
            <p className="mt-1 text-sm text-muted">
              {confirmMessage(count)}{" "}
              <select
                aria-label="Duración"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="rounded-control border border-app bg-surface px-1.5 py-0.5 text-main"
              >
                {MARK_ALL_OCCUPIED_DURATIONS.map((m) => (
                  <option key={m} value={m}>
                    {durationLabel(m)}
                  </option>
                ))}
              </select>
              . Los lugares con alguien sentado no cambian.
            </p>
            {error ? (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void run<{ count: number }>("mark-all-occupied", { minutes }, (r) => markedToastMessage(r.count))}
                disabled={pending}
                className="min-h-11 rounded-control bg-primary px-4 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-60"
              >
                Marcar como ocupados
              </button>
              <button
                type="button"
                onClick={requestClose}
                className="min-h-11 rounded-control border border-app px-4 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {message ? <SeatFreedToast message={message} onDismiss={() => setMessage(null)} /> : null}
    </div>
  );
}
