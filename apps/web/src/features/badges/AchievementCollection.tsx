"use client";

import type { AchievementDto, PublicAchievementsDto } from "@sala/contracts";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { BadgeMedal } from "./BadgeMedal";

export function AchievementGrid({ badges }: { badges: AchievementDto[] }) {
  return <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
    {badges.map(badge => <li key={badge.id} className={`flex min-w-0 flex-col items-center rounded-2xl border border-app bg-surface p-4 text-center ${badge.earned ? "" : "opacity-55"}`}>
      <BadgeMedal tier={badge.tier} size={76}/><h3 className="mt-2 text-sm font-bold text-main">{badge.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">{badge.description}</p>
      {badge.earned ? <span className="mt-3 text-xs font-semibold text-primary">Conseguida</span> : <div className="mt-3 w-full"><progress aria-label={`Avance de ${badge.title}`} value={badge.progress} max={1} className="h-1.5 w-full accent-[var(--primary)]"/><span className="mt-1 block text-xs text-muted">{Math.floor(badge.progress * 100)}%</span></div>}
    </li>)}
  </ul>;
}

export function AchievementSummary({ data }: { data: PublicAchievementsDto }) {
  if (!data.stats) return <p className="text-sm text-muted">Esta persona mantiene su actividad en privado.</p>;
  const stats = data.stats;
  return <>
    <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[[`${Math.floor(stats.studyMinutes / 60)}h ${stats.studyMinutes % 60}m`, "Estudio en la sala"], [stats.weekRank ? `#${stats.weekRank}` : "—", "Ranking semanal"], [stats.studyDays, "Días de estudio"], [stats.places, "Lugares actualizados"]].map(([value, label]) => <div key={label} className="rounded-2xl bg-surface-2 p-3"><dd className="text-xl font-bold tabular-nums text-main">{value}</dd><dt className="mt-1 text-xs text-muted">{label}</dt></div>)}
    </dl>
    {data.badges.length ? <AchievementGrid badges={data.badges}/> : <p className="text-sm text-muted">Sus primeras insignias están por llegar.</p>}
  </>;
}

export function PublicAchievements({ userId }: { userId: string }) {
  const [data, setData] = useState<PublicAchievementsDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<PublicAchievementsDto>(`/api/v1/profiles/${encodeURIComponent(userId)}/achievements`, { signal: controller.signal })
      .then(dto => { if (!controller.signal.aborted) { setData(dto); setFailed(false); } })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [userId, attempt]);
  return <section aria-label="Insignias y actividad" className="mt-4 rounded-3xl border border-app bg-surface p-5 sm:p-6"><h2 className="mb-5 text-lg font-bold">Insignias y actividad</h2>
    {failed ? <button type="button" onClick={() => setAttempt(n => n + 1)} className="min-h-11 text-sm text-primary underline">No pudimos cargar la actividad. Reintentar</button> : data ? <AchievementSummary data={data}/> : <p className="text-sm text-muted" role="status">Cargando insignias…</p>}
  </section>;
}
