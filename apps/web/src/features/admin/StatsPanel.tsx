"use client";

import type { RoomStatsDto } from "@uns/contracts";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export function StatsPanel({ roomSlug }: { roomSlug: string }) {
  const [stats, setStats] = useState<RoomStatsDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<RoomStatsDto>(`/api/v1/admin/rooms/${roomSlug}/stats`)
      .then((dto) => {
        if (!cancelled) setStats(dto);
      })
      .catch(() => {
        /* stats are non-critical for the dashboard */
      });
    return () => {
      cancelled = true;
    };
  }, [roomSlug]);

  if (!stats) return null;

  const items = [
    { label: "Fresh Seat Coverage", value: `${Math.round(stats.freshSeatCoverage * 100)}%` },
    { label: "Check-ins activos", value: stats.activeCheckIns },
    { label: "Observaciones (24h)", value: stats.observationsLast24h },
    { label: "Check-ins (24h)", value: stats.checkInsLast24h },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
          <p className="text-lg font-bold text-slate-900">{item.value}</p>
          <p className="text-xs text-slate-500">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
