"use client";

import { useEffect, useState } from "react";
import type { TableType } from "@uns/contracts";
import { apiFetch } from "@/lib/api";
import { seatDisplayLabel } from "@/features/room/format";
import { MarkAllOccupiedCard } from "./MarkAllOccupiedCard";
import type { AdminLiveDto } from "./types";

/** "M04-S03" -> "Mesa 4 · Asiento 3" / "B01-S02" -> "Barra entrada izquierda · Lugar 2" —
 *  the same friendly naming used on the room map, derived from the code alone (no table lookup
 *  needed here since `tableDisplayName` only reads `code`/`type`). */
function friendlySeatLabel(seatCode: string): string {
  const match = seatCode.match(/^(.+)-S0*(\d+)$/);
  if (!match) return seatCode;
  const [, tableCode, seatNumber] = match;
  const type: TableType = tableCode!.startsWith("B") ? "WALL_BAR" : "MAIN_TABLE";
  return seatDisplayLabel({ code: tableCode!, type }, seatCode, Number(seatNumber));
}

export function LiveRoomPanel({ roomSlug }: { roomSlug: string }) {
  const [live, setLive] = useState<AdminLiveDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AdminLiveDto>(`/api/v1/admin/rooms/${roomSlug}/live`)
      .then((dto) => {
        if (!cancelled) setLive(dto);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar la vista en vivo.");
      });
    return () => {
      cancelled = true;
    };
  }, [roomSlug, reloads]);

  if (error) return <p className="text-sm text-[var(--seat-occupied)]">{error}</p>;
  if (!live) return <p className="text-sm text-muted">Cargando…</p>;

  return (
    <div className="flex flex-col gap-3">
      <MarkAllOccupiedCard roomSlug={roomSlug} seats={live.map.seats} onDone={() => setReloads((n) => n + 1)} />
      <div className="flex flex-col gap-2 rounded-[14px] border border-app bg-surface p-4">
        <h2 className="text-sm font-semibold text-main">
          Ocupantes activos ({live.occupants.length} / {live.map.summary.total})
        </h2>
        <div className="flex flex-col divide-y divide-[var(--border)]">
          {live.occupants.map((occupant) => (
            <div key={occupant.seatId} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="font-medium text-main">{occupant.name}</span>
              <span className="truncate text-muted">{occupant.email}</span>
              <span className="w-fit shrink-0 rounded-md border border-app px-2 py-0.5 text-xs text-muted">
                {friendlySeatLabel(occupant.seatCode)}
              </span>
            </div>
          ))}
          {live.occupants.length === 0 ? <p className="py-2 text-sm text-muted">Sin check-ins activos.</p> : null}
        </div>
      </div>
    </div>
  );
}
