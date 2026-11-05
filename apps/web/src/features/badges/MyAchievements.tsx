"use client";
import { apiFetch } from "@/lib/api";
import type { AchievementCategory } from "@sala/contracts";
import { useEffect, useState } from "react";
import { useAchievements } from "./achievement-store";
import { AchievementGrid, ACHIEVEMENT_CATEGORY_LABELS, achievementCategory } from "./AchievementCollection";
import { CollaborationRewardProgress } from "./CollaborationRewardProgress";

export function MyAchievements({ userId }: { userId: string }) {
  const { data, error, refresh } = useAchievements(userId);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState<"all" | AchievementCategory>("all");
  useEffect(() => { if (window.location.hash === "#insignias") document.getElementById("insignias")?.scrollIntoView({ block: "start" }); }, []);
  const filtered = data?.badges.filter(badge => category === "all" || achievementCategory(badge) === category) ?? [];
  const next = ["free", "occupied", "collaboration"].flatMap(kind => filtered.find(badge => achievementCategory(badge) === kind && !badge.earned) ?? []);
  const recent = filtered.filter(badge => badge.earned).sort((a, b) => Date.parse(b.earnedAt ?? "1970-01-01") - Date.parse(a.earnedAt ?? "1970-01-01")).slice(0, 4);
  const preview = [...new Map([...next, ...recent, ...filtered.filter(badge => !badge.earned).sort((a, b) => b.progress - a.progress)].map(badge => [badge.id, badge])).values()].slice(0, 4);
  async function request() {
    setPending(true); setMessage("");
    try { await apiFetch("/api/v1/me/admin-application", { method: "POST" }); await refresh(); setMessage("Tu solicitud llegó al creador de la app para que la revise."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No pudimos enviar la solicitud."); }
    finally { setPending(false); }
  }
  return <section id="insignias" aria-label="Mis insignias" className="scroll-mt-24 lg:scroll-mt-36 2xl:scroll-mt-24">
    <h2 className="mb-3 text-lg font-bold">Tus insignias</h2>
    <p className="mb-4 text-sm leading-relaxed text-muted">Una colección bien de acá. Ganá mates, termos y símbolos argentinos estudiando y ayudando a actualizar la sala.</p>
    {data ? <><p className="mb-3 text-sm text-muted">{data.badges.filter(badge => badge.earned).length} de {data.badges.length} conseguidas · Las próximas metas aparecen primero.</p>
      <div role="group" aria-label="Filtrar insignias" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {(["all", "collaboration", "free", "occupied", "study"] as const).map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => { setCategory(value); setExpanded(false); }} className={`min-h-11 shrink-0 rounded-full border px-4 text-xs font-semibold ${category === value ? "border-primary bg-primary text-white" : "border-app bg-surface text-muted hover:text-main"}`}>{value === "all" ? "Todas" : ACHIEVEMENT_CATEGORY_LABELS[value]}</button>)}
      </div><AchievementGrid badges={expanded ? filtered : preview}/>{filtered.length > preview.length ? <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="mt-3 min-h-11 text-sm font-semibold text-primary">{expanded ? "Mostrar menos" : `Ver las ${filtered.length} insignias`}</button> : null}<div className="mt-4 rounded-2xl border border-app bg-surface p-4"><h3 className="font-semibold">Colaborá con la sala</h3>
      <p className="mt-2 text-sm text-muted">{data.collaboration.places} lugares actualizados en {data.collaboration.days} {data.collaboration.days === 1 ? "día" : "días"} · {data.collaboration.seeds} {data.collaboration.seeds === 1 ? "semilla ganada" : "semillas ganadas"}.</p>
      <p className="mt-2 text-sm font-semibold text-primary">{data.collaboration.freePlaces ?? 0} libres · {data.collaboration.occupiedPlaces ?? 0} ocupados</p>
      <CollaborationRewardProgress collaboration={data.collaboration} />
      <p className="mt-2 text-xs leading-relaxed text-muted">Cada lugar cuenta una vez por día, según el primer estado que reportás. Tu asiento, las repeticiones y el marcado masivo no cuentan. Los contadores de libres y ocupados empiezan con los nuevos reportes; el total anterior se conserva. Una semilla cada 10 lugares, hasta 10 diarias.</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">Con 100 lugares actualizados en al menos 3 días podés solicitar ser administrador de la sala. Ilan revisa cada solicitud.</p>
      {data.collaboration.applicationStatus === "PENDING" ? <p role="status" className="mt-3 text-sm font-semibold text-primary">Solicitud pendiente de revisión</p> : data.collaboration.applicationStatus === "APPROVED" ? <p className="mt-3 text-sm font-semibold text-primary">Tu solicitud fue aprobada</p> : data.collaboration.eligibleForAdmin ? <button type="button" onClick={() => void request()} disabled={pending} className="mt-3 min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Enviando…" : "Solicitar ser administrador"}</button> : null}
      {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
    </div></> : error ? <button type="button" onClick={() => void refresh()} className="min-h-11 text-sm text-primary underline">{error} Reintentar</button> : <p role="status" className="text-sm text-muted">Cargando insignias…</p>}
  </section>;
}
