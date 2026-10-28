"use client";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import { useAchievements } from "./achievement-store";
import { AchievementGrid } from "./AchievementCollection";

export function MyAchievements({ userId }: { userId: string }) {
  const { data, error, refresh } = useAchievements(userId);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (window.location.hash === "#insignias") document.getElementById("insignias")?.scrollIntoView({ block: "start" }); }, []);
  const preview = data ? [...data.badges.filter(badge => badge.earned).slice(-4), ...data.badges.filter(badge => !badge.earned).sort((a, b) => b.progress - a.progress)].slice(0, 4) : [];
  async function request() {
    setPending(true); setMessage("");
    try { await apiFetch("/api/v1/me/admin-application", { method: "POST" }); await refresh(); setMessage("Tu solicitud llegó al creador de la app para que la revise."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No pudimos enviar la solicitud."); }
    finally { setPending(false); }
  }
  return <section id="insignias" aria-label="Mis insignias" className="scroll-mt-24">
    <h2 className="mb-3 text-lg font-bold">Tus insignias</h2>
    <p className="mb-4 text-sm leading-relaxed text-muted">Tu tiempo y tu ayuda hacen crecer la sala. Las insignias reconocen lo que vas consiguiendo.</p>
    {data ? <><AchievementGrid badges={expanded ? data.badges : preview}/>{data.badges.length > preview.length ? <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="mt-3 min-h-11 text-sm font-semibold text-primary">{expanded ? "Mostrar menos" : `Ver las ${data.badges.length} insignias`}</button> : null}<div className="mt-4 rounded-2xl border border-app bg-surface p-4"><h3 className="font-semibold">Colaborá con la sala</h3>
      <p className="mt-2 text-sm text-muted">{data.collaboration.places} lugares actualizados en {data.collaboration.days} días · {data.collaboration.seeds} semillas ganadas.</p>
      <p className="mt-2 text-xs leading-relaxed text-muted">Una semilla cada 10 lugares distintos del día, hasta 10 semillas diarias. Las repeticiones y el marcado masivo no cuentan. Las semillas ayudan a plantar; las plantas crecen con tu tiempo de estudio.</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">Con 100 lugares actualizados en al menos 3 días podés solicitar ser administrador de la sala. Ilan revisa cada solicitud.</p>
      {data.collaboration.applicationStatus === "PENDING" ? <p role="status" className="mt-3 text-sm font-semibold text-primary">Solicitud pendiente de revisión</p> : data.collaboration.applicationStatus === "APPROVED" ? <p className="mt-3 text-sm font-semibold text-primary">Tu solicitud fue aprobada</p> : data.collaboration.eligibleForAdmin ? <button type="button" onClick={() => void request()} disabled={pending} className="mt-3 min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Enviando…" : "Solicitar ser administrador"}</button> : null}
      {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
    </div></> : error ? <button type="button" onClick={() => void refresh()} className="min-h-11 text-sm text-primary underline">{error} Reintentar</button> : <p role="status" className="text-sm text-muted">Cargando insignias…</p>}
  </section>;
}
