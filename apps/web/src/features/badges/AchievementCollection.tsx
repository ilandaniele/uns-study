"use client";

import type { AchievementCategory, AchievementDto, PublicAchievementsDto } from "@sala/contracts";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { BadgeMedal } from "./BadgeMedal";
import { badgeProgressText } from "./badge-progress";
import styles from "./achievements.module.css";

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = { collaboration: "Colaboración", free: "Libres", occupied: "Ocupados", study: "Estudio" };
export const achievementCategory = (badge: AchievementDto): AchievementCategory => badge.category ?? (badge.id.startsWith("collaboration_") ? "collaboration" : "study");

export function AchievementGrid({ badges }: { badges: AchievementDto[] }) {
  return <ul className={`grid grid-cols-2 gap-3 ${badges.length === 4 ? "" : "sm:grid-cols-3"}`}>
    {badges.map(badge => {
      const progress = badgeProgressText(badge);
      return <li key={badge.id} data-achievement-id={badge.id} data-earned={badge.earned} className={`flex min-w-0 flex-col items-center rounded-2xl border bg-surface p-4 text-center ${badge.earned ? "border-primary/35" : "border-app"}`}>
      <span className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">{ACHIEVEMENT_CATEGORY_LABELS[achievementCategory(badge)]}</span>
      <div className={badge.earned ? "" : "opacity-35 grayscale"}><BadgeMedal tier={badge.tier} badgeId={badge.id} size={88}/></div><h3 className="mt-2 text-sm font-bold text-main">{badge.title}</h3>
      {!badge.earned ? <span className="mt-1 rounded-full bg-surface-2 px-2 py-1 text-[10px] font-semibold text-muted">Por conseguir</span> : null}
      <p className="mt-1 text-xs leading-relaxed text-muted">{badge.description}</p>
      <div className="mt-auto w-full pt-4"><p className="mb-2 text-xs font-semibold tabular-nums text-main">{badge.earned ? "Conseguida" : progress.count}</p><progress aria-label={`Avance de ${badge.title}`} aria-valuetext={`${progress.count}. ${progress.remaining}`} value={badge.earned ? 1 : badge.progress} max={1} className={styles.progress}/><p className={`mt-2 text-xs ${badge.earned ? "font-semibold text-primary" : "text-muted"}`}>{progress.remaining}</p></div>
    </li>;})}
  </ul>;
}

export function AchievementSummary({ data }: { data: PublicAchievementsDto }) {
  if (!data.stats) return <p className="text-sm text-muted">Esta persona mantiene su actividad en privado.</p>;
  const stats = data.stats;
  return <>
    <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[[`${Math.floor(stats.studyMinutes / 60)}h ${stats.studyMinutes % 60}m`, "Estudio en la sala"], [stats.weekRank ? `#${stats.weekRank}` : "—", "Ranking semanal"], [stats.studyDays, "Días de estudio"], [stats.places, "Lugares actualizados"]].map(([value, label]) => <div key={label} className="rounded-2xl bg-surface-2 p-3"><dd className="text-xl font-bold tabular-nums text-main">{value}</dd><dt className="mt-1 text-xs text-muted">{label}</dt></div>)}
    </dl>
    {data.badgesVisible === false ? <p className="text-sm text-muted">Esta persona no muestra sus insignias.</p> : data.badges.length ? <AchievementGrid badges={data.badges}/> : <p className="text-sm text-muted">Sus primeras insignias están por llegar.</p>}
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
