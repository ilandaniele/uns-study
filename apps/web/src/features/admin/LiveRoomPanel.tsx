"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AdminLiveDto } from "./types";

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

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!live) return <p className="text-sm text-slate-500">Cargando…</p>;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">
        Ocupantes activos ({live.occupants.length} / {live.map.summary.total})
      </h2>
      <div className="flex flex-col divide-y divide-slate-100">
        {live.occupants.map((occupant) => (
          <div key={occupant.seatId} className="flex items-center justify-between py-2 text-sm">
            <span className="font-medium text-slate-800">{occupant.name}</span>
            <span className="text-slate-500">{occupant.email}</span>
            <span className="font-mono text-xs text-slate-400">{occupant.seatCode}</span>
          </div>
        ))}
        {live.occupants.length === 0 ? <p className="py-2 text-sm text-slate-400">Sin check-ins activos.</p> : null}
      </div>
    </div>
  );
}
