"use client";

import type { RoomMapDto, SeatDto, TableDto } from "@sala/contracts";
import { FunnelSimpleIcon, MagnifyingGlassIcon, ShareNetworkIcon, StarIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { seatDisplayLabel, statusLabel } from "./format";
import { pickFreeSeat, roomShareText } from "./room-tools";

export interface RoomQuickActionsProps {
  map: RoomMapDto;
  onlyFree: boolean;
  onToggleOnlyFree: () => void;
  favoriteSeat: SeatDto | null;
  favoriteTable: TableDto | null;
  onSelectSeat: (seatId: string) => void;
}

/**
 * Toolbar under the counters: jump to the best free seat, filter the map to free seats, open the
 * favorite seat (with its live status) and share the room's current availability.
 */
export function RoomQuickActions({ map, onlyFree, onToggleOnlyFree, favoriteSeat, favoriteTable, onSelectSeat }: RoomQuickActionsProps) {
  const [notice, setNotice] = useState<string | null>(null);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3000);
  }

  function findFree() {
    const seat = pickFreeSeat(map, favoriteSeat?.id ?? null);
    if (!seat) {
      flash("No hay lugares libres reportados ahora.");
      return;
    }
    onSelectSeat(seat.id);
  }

  async function share() {
    const url = window.location.href.split("?")[0]!;
    const text = roomShareText(map.summary, url);
    try {
      // The link is part of the text, so apps that get both `text` and `url` don't show it twice.
      if (navigator.share) {
        await navigator.share({ title: map.room.name, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      flash("Copiado. Pegalo donde quieras.");
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") flash("No se pudo compartir. Copiá el link desde la barra de direcciones.");
    }
  }

  const chip =
    "flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[13px] font-semibold transition-colors";

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={findFree}
          className={`${chip} border-transparent bg-primary text-white hover:bg-primary-dark`}
        >
          <MagnifyingGlassIcon aria-hidden="true" size={16} weight="bold" />
          Buscar lugar libre
        </button>
        <button
          type="button"
          onClick={onToggleOnlyFree}
          aria-pressed={onlyFree}
          className={`${chip} ${
            onlyFree ? "border-[var(--seat-free)] bg-[var(--surface-2)] text-main" : "border-app bg-surface text-main hover:border-[var(--border-strong)]"
          }`}
        >
          <FunnelSimpleIcon aria-hidden="true" size={16} weight={onlyFree ? "fill" : "bold"} style={onlyFree ? { color: "var(--seat-free)" } : undefined} />
          {onlyFree ? "Mostrando libres" : "Solo libres"}
        </button>
        {favoriteSeat ? (
          <button
            type="button"
            onClick={() => onSelectSeat(favoriteSeat.id)}
            className={`${chip} border-app bg-surface text-main hover:border-[var(--border-strong)]`}
          >
            <StarIcon aria-hidden="true" size={16} weight="fill" style={{ color: "var(--seat-saved)" }} />
            <span className="truncate">
              {seatDisplayLabel(favoriteTable, favoriteSeat.code, favoriteSeat.seatNumber)} · {statusLabel(favoriteSeat.status).toLowerCase()}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void share()}
          className={`${chip} border-app bg-surface text-main hover:border-[var(--border-strong)] ${favoriteSeat ? "" : "col-span-2"}`}
        >
          <ShareNetworkIcon aria-hidden="true" size={16} weight="bold" />
          Compartir estado de la sala
        </button>
      </div>
      {notice ? (
        <p role="status" className="text-xs text-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
