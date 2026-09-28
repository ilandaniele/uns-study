"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AdminLiveDto } from "./types";

/** "M04-S03" -> "M04·3", matching the seat call-number style used on the room map. */
function callNumber(seatCode: string): string {
  const match = seatCode.match(/^(.+)-S0*(\d+)$/);
  return match ? `${match[1]}·${match[2]}` : seatCode;
}

export function LiveRoomPanel({ roomSlug }: { roomSlug: string }) {
  const [live, setLive] = useState<AdminLiveDto | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, [roomSlug]);

  if (error) return <p className="text-sm text-[var(--seat-occupied)]">{error}</p>;
  if (!live) return <p className="text-sm text-muted">Cargando…</p>;

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-app bg-surface p-4">
      <h2 className="text-sm font-semibold text-main">
        Ocupantes activos ({live.occupants.length} / {live.map.summary.total})
      </h2>
      <div className="flex flex-col divide-y divide-[var(--border)]">
        {live.occupants.map((occupant) => (
          <div key={occupant.seatId} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span className="font-medium text-main">{occupant.name}</span>
            <span className="truncate text-muted">{occupant.email}</span>
            <span className="w-fit shrink-0 rounded-full border border-app px-2 py-0.5 font-mono text-xs text-muted">
              {callNumber(occupant.seatCode)}
            </span>
          </div>
        ))}
        {live.occupants.length === 0 ? <p className="py-2 text-sm text-muted">Sin check-ins activos.</p> : null}
      </div>
    </div>
  );
}
