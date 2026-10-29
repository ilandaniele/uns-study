"use client";
import { Fragment, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import type { RoomMapDto, SimpleCheckInResult } from "@sala/contracts";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { seatDisplayLabel, statusLabel, tableDisplayName } from "@/features/room/format";

export function SimpleSeatConfirmation({ map, decision, pending, error, challenge, onConfirm, onCancel }: {
  map: RoomMapDto; decision: Extract<SimpleCheckInResult, { outcome: "CONFIRM" }>; pending: boolean; error: string | null;
  challenge: ReactNode; onConfirm: (seatId: string) => void; onCancel: () => void;
}) {
  const suggested = map.seats.find(s => s.id === decision.suggestedSeatId && !s.occupiedUntil && !s.dispute);
  const [tableId, setTableId] = useState<string | null>(suggested?.tableId ?? null);
  const [seatId, setSeatId] = useState<string | null>(suggested?.id ?? null);
  const [choosing, setChoosing] = useState(!suggested);
  const showPicker = choosing || !suggested;
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, { onEscape: pending ? undefined : onCancel });
  const selected = map.seats.find(s => s.id === seatId && s.tableId === tableId);
  const table = map.tables.find(t => t.id === tableId);
  const tableSeats = map.seats.filter(s => s.tableId === tableId).sort((a, b) => a.y - b.y || a.x - b.x);
  const mainTable = table?.type === "MAIN_TABLE";
  const verticalBar = !mainTable && tableSeats.length > 1 && Math.abs(tableSeats[0]!.y - tableSeats[tableSeats.length - 1]!.y) > Math.abs(tableSeats[0]!.x - tableSeats[tableSeats.length - 1]!.x);
  const available = selected && !selected.occupiedUntil && !selected.dispute;
  return createPortal(<div className="backdrop-enter fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={event => { if (event.target === event.currentTarget && !pending) onCancel(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="simple-seat-title" tabIndex={-1}
      className="max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-sheet border border-app bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-float">
      <div className="flex items-start justify-between gap-2"><h2 id="simple-seat-title" className="text-xl font-bold text-main">Confirmá dónde estás sentado</h2>
        <button type="button" disabled={pending} onClick={onCancel} aria-label="Cerrar confirmación" className="-mr-2 -mt-2 flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 disabled:opacity-50"><XIcon size={20} aria-hidden="true"/></button></div>
      {!showPicker && suggested ? <>
        <div className="mt-5 rounded-2xl border border-app bg-surface-2 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{decision.suggestionSource === "PREVIOUS_CHECK_IN" ? "Tu último lugar" : "Cerca de tu ubicación"}</p>
          <p className="mt-2 text-xl font-bold text-main">{seatDisplayLabel(map.tables.find(t => t.id === suggested.tableId) ?? null, suggested.code, suggested.seatNumber)}</p>
          <p className="mt-2 text-sm text-muted">{decision.suggestionSource === "PREVIOUS_CHECK_IN" ? "¿Volviste a sentarte acá?" : "¿Es el lugar donde estás sentado?"}</p>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" disabled={pending || !available} onClick={() => { if (selected && available) onConfirm(selected.id); }} className="min-h-12 rounded-full bg-primary px-5 font-semibold text-white disabled:opacity-50">{pending ? "Marcando…" : "Sí, estoy acá"}</button>
          <button type="button" disabled={pending} onClick={() => { setChoosing(true); setSeatId(null); }} className="min-h-11 rounded-full border border-app px-5 text-sm font-semibold text-main disabled:opacity-50">Estoy en otro lugar</button>
        </div>
      </> : <>
      <p className="mt-2 text-sm text-muted">{decision.reason === "NEAREST_UNAVAILABLE" ? "El lugar más cercano no está disponible. Elegí el que ya estás usando." : "Elegí tu mesa y tocá tu asiento para marcarlo."}</p>
      <fieldset disabled={pending} className="mt-5">
        <legend className="mb-2 text-sm font-semibold text-main">Tu mesa</legend>
        <div className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4">{[...map.tables].sort((a, b) => Number(b.type === "MAIN_TABLE") - Number(a.type === "MAIN_TABLE") || a.code.localeCompare(b.code)).map(table => <button key={table.id} type="button" aria-pressed={tableId === table.id}
          onClick={() => { setTableId(table.id); setSeatId(null); }} className={`min-h-11 rounded-xl border px-2 py-2 text-xs font-semibold ${tableId === table.id ? "border-primary bg-primary text-white" : "border-app text-main hover:bg-surface-2"}`}>{tableDisplayName(table, table.code)}</button>)}</div>
      </fieldset>
      {tableId ? <fieldset disabled={pending} className="mt-5"><legend className="mb-2 text-sm font-semibold text-main">Tu asiento</legend>
        <p className="mb-2 text-center text-xs text-muted">Ventanas arriba · Entrada abajo</p>
        <div className={`grid gap-2 ${mainTable ? "grid-cols-4" : verticalBar ? "mx-auto max-w-40 grid-cols-1" : "grid-cols-3"}`}>{tableSeats.map((seat, index) => <Fragment key={seat.id}>
          {mainTable && index === 4 ? <div className="col-span-full flex h-8 items-center justify-center rounded-lg border border-app bg-surface-2 text-xs text-muted">Mesa</div> : null}
          <button type="button" disabled={Boolean(seat.occupiedUntil || seat.dispute)} aria-label={`Marcar asiento ${seat.seatNumber} · ${seat.occupiedUntil ? "Con persona" : statusLabel(seat.status)}`} aria-busy={pending && seatId === seat.id}
          onClick={() => { setSeatId(seat.id); onConfirm(seat.id); }} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border p-2 disabled:opacity-40 ${seatId === seat.id ? "border-primary bg-primary text-white" : "border-app text-main hover:bg-surface-2"}`}>
          <span className="font-bold">{seat.seatNumber}</span><span className="text-[10px]">{seat.occupiedUntil ? "Con persona" : statusLabel(seat.status)}</span>
        </button></Fragment>)}</div></fieldset> : null}
      {selected ? <p className="mt-4 text-sm font-semibold text-main">{seatDisplayLabel(map.tables.find(t => t.id === selected.tableId) ?? null, selected.code, selected.seatNumber)}</p> : null}
      </>}
      <p className="mt-3 text-xs leading-relaxed text-muted">Marcá únicamente el lugar que ya estás usando. Esto no reserva un asiento.</p>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--seat-occupied)]">{error}</p> : null}{challenge}
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" disabled={pending} onClick={onCancel} className="min-h-11 rounded-full border border-app px-5 text-sm font-semibold text-main disabled:opacity-50">Cancelar</button></div>
    </div>
  </div>, document.body);
}
