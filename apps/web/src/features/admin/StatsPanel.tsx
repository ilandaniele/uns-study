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

  const coveragePct = Math.round(stats.freshSeatCoverage * 100);
  const items = [
    { label: "Check-ins activos", value: stats.activeCheckIns },
    { label: "Observaciones (24h)", value: stats.observationsLast24h },
    { label: "Check-ins (24h)", value: stats.checkInsLast24h },
  ];

  return (
    <div className="rounded-[14px] border border-app bg-surface p-4">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted">Fresh Seat Coverage</span>
        <span className="font-mono font-semibold text-main">{coveragePct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]" role="img" aria-label="Cobertura de datos frescos">
        <div className="occupancy-segment h-full rounded-full bg-primary" style={{ width: `${coveragePct}%` }} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-app pt-3 text-center">
        {items.map((item) => (
          <div key={item.label}>
            <dd className="font-mono text-lg font-semibold text-main">{item.value}</dd>
            <dt className="mt-0.5 text-xs text-muted">{item.label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
