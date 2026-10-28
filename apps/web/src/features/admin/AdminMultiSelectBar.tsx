"use client";

import { useId, useRef, useState } from "react";
import { XIcon, ChecksIcon, EraserIcon, CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { markSeatsToastMessage, selectionLabel, type MarkSeatsStatus } from "./mark-seats";

export interface AdminMultiSelectBarProps {
  roomSlug: string;
  seatIds: ReadonlySet<string>;
  selectedLabels: { id: string; label: string }[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
  onDone: (message: string) => void;
}

/** Controls stay beside the map; changes are applied only after choosing a status. */
export function AdminMultiSelectBar({ roomSlug, seatIds, selectedLabels, onRemove, onClear, onClose, onPendingChange, onDone }: AdminMultiSelectBarProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const [showSelected, setShowSelected] = useState(false);
  const selectionId = useId();
  const count = seatIds.size;

  async function mark(status: MarkSeatsStatus) {
    if (busy.current || !count) return;
    busy.current = true;
    setPending(true);
    onPendingChange(true);
    setError(null);
    try {
      const result = await apiFetch<{ count: number; skipped: number }>(`/api/v1/admin/rooms/${roomSlug}/mark-seats`, {
        method: "POST", body: JSON.stringify({ seatIds: [...seatIds], status }),
      });
      onDone(markSeatsToastMessage(status, result.count, result.skipped));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "No pudimos completar la acción. Tu selección sigue disponible para reintentar.");
    } finally {
      busy.current = false;
      setPending(false);
      onPendingChange(false);
    }
  }

  return <div role="region" aria-label="Selección de varios lugares" className="rounded-2xl border border-primary/40 bg-surface p-3 shadow-sm">
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={() => setShowSelected(value => !value)} disabled={!count} aria-expanded={showSelected && !!count} aria-controls={showSelected && count ? selectionId : undefined} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold"><ChecksIcon size={20} className="shrink-0 text-primary" aria-hidden="true"/><span aria-live="polite">{selectionLabel(count)}</span>{count ? <CaretDownIcon size={14} className={showSelected ? "shrink-0 rotate-180" : "shrink-0"} aria-hidden="true"/> : null}</button>
      {count ? <button type="button" aria-label="Desmarcar selección" title="Desmarcar selección" onClick={() => { onClear(); setShowSelected(false); }} disabled={pending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app disabled:opacity-50"><EraserIcon size={18} aria-hidden="true"/></button> : null}
      <button type="button" onClick={onClose} disabled={pending} aria-label="Cancelar" title="Cancelar" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border border-app px-3 text-xs font-semibold disabled:opacity-50"><XIcon size={16} aria-hidden="true"/><span className="hidden sm:inline">Cancelar</span></button>
    </div>
    <p className="mt-1 text-xs leading-relaxed text-muted">Elegí asientos en el mapa y aplicá un estado. Los lugares con alguien sentado no cambian.</p>
    {showSelected && selectedLabels.length ? <div id={selectionId} className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Lugares elegidos">
      {selectedLabels.map(seat => <button key={seat.id} type="button" disabled={pending} onClick={() => onRemove(seat.id)} aria-label={`Quitar ${seat.label} de la selección`} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary disabled:opacity-50">{seat.label}<XIcon size={12} aria-hidden="true"/></button>)}
    </div> : null}
    <div className="mt-2 grid grid-cols-2 gap-2">
      <button type="button" aria-label={`Marcar ocupados${count ? ` (${count})` : ""}`} onClick={() => void mark("OCCUPIED")} disabled={pending || !count} className="min-h-11 rounded-full bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Aplicando…" : `Ocupados${count ? ` (${count})` : ""}`}</button>
      <button type="button" aria-label={`Marcar libres${count ? ` (${count})` : ""}`} onClick={() => void mark("FREE")} disabled={pending || !count} className="min-h-11 rounded-full border border-app px-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50">Libres{count ? ` (${count})` : ""}</button>
    </div>
    {error ? <p role="alert" className="mt-2 text-sm text-[var(--seat-occupied)]">{error}</p> : null}
  </div>;
}
