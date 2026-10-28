"use client";

import { seenAchievementsSchema, type AchievementsDto, type BadgeId } from "@sala/contracts";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { apiPost } from "@/lib/api";
import { useMe } from "@/lib/me-store";
import { useAchievements } from "./achievement-store";
import { BadgeMedal } from "./BadgeMedal";
import styles from "./achievement-reveal.module.css";

export function AchievementRuntime() {
  const { me } = useMe();
  return me?.user ? <SignedInAchievements key={me.user.id} userId={me.user.id}/> : null;
}

function SignedInAchievements({ userId }: { userId: string }) {
  const { data, refresh } = useAchievements(userId);
  const [dismissed, setDismissed] = useState<BadgeId[]>([]);
  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(update, 5 * 60_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("sala:achievements-refresh", update);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", update); window.removeEventListener("sala:achievements-refresh", update); };
  }, [refresh]);
  const unseen = data?.badges.filter(badge => data.unseenIds.includes(badge.id) && !dismissed.includes(badge.id)) ?? [];
  const ids = unseen.map(badge => badge.id);
  const acknowledge = useCallback((seen: BadgeId[]) => {
    setDismissed(previous => [...new Set([...previous, ...seen])]);
    void apiPost("/api/v1/me/achievements/seen", { ids: seen }, seenAchievementsSchema).catch(() => undefined);
  }, []);
  if (!unseen.length || !data) return null;
  return <AchievementReveal key={ids.join(",")} data={data} ids={ids} onDismiss={acknowledge}/>;
}

function AchievementReveal({ data, ids, onDismiss }: { data: AchievementsDto; ids: BadgeId[]; onDismiss: (ids: BadgeId[]) => void }) {
  const earned = data.badges.filter(badge => ids.includes(badge.id));
  const medal = earned[earned.length - 1];
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(ids), 9_000);
    return () => clearTimeout(timer);
  }, [ids, onDismiss]);
  return createPortal(<aside role="status" aria-label="Nueva insignia" className={`${styles.reveal} pointer-events-none fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[80] mx-auto w-auto max-w-sm rounded-3xl border border-amber-300/40 bg-[#101a20] px-6 pb-5 pt-6 text-center text-white shadow-2xl`}>
    <div className={styles.rays} aria-hidden="true"/>
    <div className="relative flex flex-col items-center">
      <span className="text-[10px] font-bold uppercase tracking-[.24em] text-amber-200">Insignia desbloqueada</span>
      <div className={`${styles.medal} my-3`}><BadgeMedal tier={medal.tier} size={112}/></div>
      <h2 className="text-xl font-bold">{medal.title}</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">{medal.description}</p>
      {earned.length > 1 ? <p className="mt-2 text-xs text-amber-200">Y {earned.length - 1} {earned.length === 2 ? "insignia más" : "insignias más"} en tu colección</p> : null}
      <div className="pointer-events-auto mt-5 flex items-center justify-center gap-3"><Link href="/perfil#insignias" onClick={() => onDismiss(ids)} className="inline-flex min-h-11 items-center rounded-full bg-amber-200 px-5 text-sm font-bold text-slate-950">Ver insignias</Link><button type="button" onClick={() => onDismiss(ids)} className="min-h-11 rounded-full border border-white/25 px-4 text-sm font-semibold">Cerrar</button></div>
    </div>
  </aside>, document.body);
}
