"use client";
import { useEffect, useState } from "react";
import type { StudyPresenceDto } from "@sala/contracts";
import { apiFetch, apiPost } from "@/lib/api";
import { refreshMe, useMe } from "@/lib/me-store";
import { watchStudyLocation } from "./study-location";

export function StudyPresenceRuntime() {
  const { me } = useMe();
  const [sample, setSample] = useState<StudyPresenceDto | null>(null);
  const [retry, setRetry] = useState(0);
  const [sampling, setSampling] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const checkInId = me?.activeCheckIn?.id, userId = me?.user?.id;
  useEffect(() => {
    if (!checkInId || !userId) return;
    let alive = true, busy = false, trackingHere = false, cancel = () => undefined as void;
    const accept = (dto: StudyPresenceDto | null) => {
      if (!alive) return;
      if (dto?.checkInId === checkInId) { trackingHere = dto.trackingHere !== false; setSample(dto); }
      if (!dto || dto.state === "RELEASED") void refreshMe().catch(() => undefined);
    };
    const status = async () => { if (alive && document.visibilityState === "visible") await apiFetch<StudyPresenceDto | null>("/api/v1/checkins/current/presence").then(accept).catch(() => undefined); };
    const locate = () => {
      if (!alive || !trackingHere || document.visibilityState !== "visible" || busy) return;
      busy = true;
      setSampling(true); setUnavailable(false);
      cancel();
      cancel = watchStudyLocation(location => {
        if (!alive) return;
        void apiPost<StudyPresenceDto>("/api/v1/checkins/current/presence", { checkInId, location }).then(accept).catch(() => { void status(); }).finally(() => { busy = false; if (alive) setSampling(false); });
      }, () => { busy = false; if (alive) { setSampling(false); setUnavailable(true); void status(); } });
    };
    const resume = () => { void status().then(locate); };
    const visibility = () => { cancel(); busy = false; setSampling(false); if (document.visibilityState === "visible") resume(); };
    resume();
    let cycles = 0;
    const interval = setInterval(() => { void status(); if (++cycles % 6 === 0) locate(); }, 30_000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", resume);
    return () => { alive = false; cancel(); clearInterval(interval); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", resume); };
  }, [checkInId, userId, retry]);
  if (!checkInId || !userId) return null;
  const current = sample?.checkInId === checkInId ? sample : null;
  const paused = current?.state !== "COUNTING";
  return <aside aria-label="Control de presencia" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-muted">
    <p role="status" className="max-w-3xl">{current?.trackingHere === false ? "La ubicación se verifica en el navegador donde marcaste tu lugar. Este dispositivo sólo consulta el estado."
      : current?.state === "AWAY" ? <>Horas en pausa: detectamos que saliste de la sala. Si no volvés, liberamos el lugar a las {new Date(current.releaseAt!).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })}.</>
      : unavailable ? "No pudimos leer tu ubicación. Revisá el permiso del navegador; las horas se pausan sin lecturas válidas."
      : paused ? "Revisando presencia. Sin una ubicación válida, las horas se pausan a los 5 minutos."
      : "Horas activas · mantené la app visible para verificar que seguís en la sala. No guardamos tus coordenadas."}</p>
    {current?.trackingHere === false ? null : <button type="button" disabled={sampling} onClick={() => setRetry(n => n + 1)} className="min-h-9 rounded-full border border-app px-3 font-semibold text-main disabled:opacity-60">{sampling ? "Revisando…" : "Revisar ubicación"}</button>}
  </aside>;
}
