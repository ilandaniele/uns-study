"use client";

import { useEffect, useState } from "react";
import { APP_SECTION_LABELS, type SectionUsageDto } from "@sala/contracts";
import { apiFetch } from "@/lib/api";

export function SectionUsagePanel() {
  const [days, setDays] = useState<7 | 30>(7);
  return <section aria-labelledby="section-usage-title" className="rounded-2xl border border-app bg-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="section-usage-title" className="font-semibold">Qué secciones se usan más</h2>
      <div role="group" aria-label="Período de uso" className="flex gap-1 rounded-full bg-surface-2 p-1">{([7, 30] as const).map(period => <button key={period} type="button" aria-pressed={days === period} onClick={() => setDays(period)} className={`min-h-11 rounded-full px-4 text-xs font-semibold ${days === period ? "bg-primary text-white" : "text-muted"}`}>{period} días</button>)}</div>
    </div>
    <UsageRows key={days} days={days} />
    <p className="mt-4 text-xs leading-relaxed text-muted">Aperturas aproximadas, no personas únicas ni tiempo de uso. Se omiten repeticiones rápidas en una misma pestaña. Los datos se empiezan a reunir desde esta actualización.</p>
  </section>;
}

function UsageRows({ days }: { days: 7 | 30 }) {
  const [data, setData] = useState<SectionUsageDto | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void apiFetch<SectionUsageDto>(`/api/v1/admin/usage/sections?days=${days}`)
      .then(dto => { if (!cancelled) { setData(dto); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [days, attempt]);
  if (error) return <div className="mt-4 text-sm"><p role="alert">No pudimos cargar las estadísticas.</p><button type="button" className="min-h-11 text-primary underline" onClick={() => setAttempt(n => n + 1)}>Reintentar</button></div>;
  if (!data) return <p role="status" className="mt-4 text-sm text-muted">Cargando aperturas…</p>;
  if (!data.total) return <p className="mt-4 text-sm text-muted">Todavía no hay aperturas registradas en este período.</p>;
  const max = Math.max(1, ...data.sections.map(row => row.views));
  return <ol aria-label="Aperturas por sección" className="mt-5 space-y-3">{data.sections.map(row => <li key={row.section}>
    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm"><span>{APP_SECTION_LABELS[row.section]}</span><span className="font-mono font-semibold tabular-nums"><span>{row.views.toLocaleString("es-AR")}</span><span className="sr-only"> aperturas · </span><span className="ml-2 font-sans text-xs font-normal text-muted">{Math.round(row.views / data.total * 100)}%</span></span></div>
    <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${row.views / max})` }} /></div>
  </li>)}</ol>;
}
