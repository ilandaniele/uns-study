"use client";

import type { RoomDailyStatDto, RoomStatsDto } from "@sala/contracts";
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
  const usage = [
    { label: "Activos (7d)", value: stats.activeUsers7d },
    { label: "Activos (30d)", value: stats.activeUsers30d },
    { label: "Vuelven (7d)", value: stats.returningUsers7d },
    { label: "Vuelven (30d)", value: stats.returningUsers30d },
  ];
  const qrShare = stats.qrVerifiedObservationShare30d;

  return (
    <div className="rounded-[14px] border border-app bg-surface p-4">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted">Fresh Seat Coverage</span>
        <span className="font-mono font-semibold text-main">{coveragePct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]" role="img" aria-label="Cobertura de datos frescos">
        <div className="occupancy-segment h-full bg-primary" style={{ transform: `scaleX(${coveragePct / 100})` }} />
      </div>

      <DailyTrend days={stats.dailyStats} />

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-app pt-3 text-center">
        {items.map((item) => (
          <div key={item.label}>
            <dd className="font-mono text-lg font-semibold text-main">{item.value}</dd>
            <dt className="mt-0.5 text-xs text-muted">{item.label}</dt>
          </div>
        ))}
      </dl>

      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-app pt-3 text-center sm:grid-cols-4">
        {usage.map((item) => (
          <div key={item.label}>
            <dd className="font-mono text-lg font-semibold text-main">{item.value}</dd>
            <dt className="mt-0.5 text-xs text-muted">{item.label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">
        Observaciones con QR (30d):{" "}
        <span className="font-mono font-semibold text-main">
          {qrShare === null ? "sin datos" : `${Math.round(qrShare * 100)}% (${stats.qrVerifiedObservations30d}/${stats.observations30d})`}
        </span>
      </p>
    </div>
  );
}

/** Bars of daily seat coverage for the last closed days; scaleY only, with a text summary for screen readers. */
function DailyTrend({ days }: { days: RoomDailyStatDto[] }) {
  if (days.length === 0) {
    return <p className="mt-4 text-xs text-muted">Todavía no hay historial diario de cobertura.</p>;
  }
  const avgPct = Math.round((days.reduce((sum, d) => sum + d.freshSeatCoverage, 0) / days.length) * 100);
  const last = days[days.length - 1]!;
  const span = days.length === 1 ? "último día" : `últimos ${days.length} días`;
  const summary = `Lugares con datos en el día, ${span}: promedio ${avgPct}%, último día (${last.day}) ${Math.round(last.freshSeatCoverage * 100)}%.`;

  return (
    <div className="mt-4">
      <p className="text-xs text-muted">Lugares con datos en el día ({span})</p>
      <div role="img" aria-label={summary} className="mt-1.5 flex h-12 items-end gap-0.5">
        {days.map((d) => (
          <div key={d.day} className="flex h-full min-w-0 flex-1 items-end rounded-sm bg-[var(--surface-2)]" title={`${d.day}: ${Math.round(d.freshSeatCoverage * 100)}%`}>
            <div className="h-full w-full origin-bottom rounded-sm bg-primary" style={{ transform: `scaleY(${Math.max(d.freshSeatCoverage, 0.02)})` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
