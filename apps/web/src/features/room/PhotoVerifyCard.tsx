"use client";

import { CameraIcon, ImageIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { describeActionError } from "@/lib/errors";
import { getFreshLocation } from "@/lib/geolocation";
import { compressPhotoForUpload } from "@/lib/photo";
import { withPresence } from "@/lib/presence-grant";
import { useMe } from "@/lib/me-store";
import { getVerificationStatus, uploadSeatPhoto, type CapturedPhoto } from "@/lib/verification";

const REASON_COPY: Record<string, string> = {
  SEAT_MISMATCH: "La imagen parece corresponder a otro lugar. Revisá que marcaste tu asiento y sacá una foto más amplia desde donde estás sentado.",
  LOW_CONFIDENCE: "La foto no permite distinguir este asiento con suficiente certeza. Incluí la mesa y alguna referencia, como ventanas o entrada.",
  NO_PREDICTION: "No pudimos ubicar el asiento. Probá una foto más amplia y con buena luz: las mesas se parecen entre sí.",
  VERIFIER_ERROR: "El servicio de verificación tuvo un problema. Tu lugar sigue marcado; podés volver a intentar más tarde.",
  VERIFIER_TIMEOUT: "El servicio tardó demasiado. Tu lugar sigue marcado. Probá de nuevo en un momento.",
};
export interface PhotoVerifyCardProps { checkInId: string; onChanged: () => void }
export function PhotoVerifyCard(props: PhotoVerifyCardProps) { return <PhotoCapture key={props.checkInId} {...props}/>; }

function PhotoCapture({ checkInId, onChanged }: PhotoVerifyCardProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [provider, setProvider] = useState("el servicio de IA");
  const [statusFailed, setStatusFailed] = useState(false);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [phase, setPhase] = useState<"idle" | "preparing" | "verifying">("idle");
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const { me } = useMe();
  const pending = phase !== "idle";
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    void getVerificationStatus().then(status => { if (!cancelled) { setEnabled(status.enabled); setProvider(status.provider === "gemini" ? "Google Gemini" : status.provider === "anthropic" ? "Anthropic Claude" : "el servicio de IA"); setStatusFailed(false); } })
      .catch(() => { if (!cancelled) setStatusFailed(true); });
    return () => { cancelled = true; };
  }, [statusAttempt]);

  async function selectPhoto(file: File) {
    if (pending) return;
    setPhase("preparing"); setMessage(null); setPhoto(null);
    try { const image = await compressPhotoForUpload(file); if (mounted.current) setPhoto(image); }
    catch (error) { if (mounted.current) setMessage({ tone: "error", text: error instanceof Error ? error.message : "No pudimos abrir la foto." }); }
    finally { if (mounted.current) { setPhase("idle"); if (cameraRef.current) cameraRef.current.value = ""; if (galleryRef.current) galleryRef.current.value = ""; } }
  }
  async function verify() {
    if (!photo || pending) return;
    setPhase("verifying"); setMessage(null);
    try {
      const roomId = me?.activeCheckIn?.id === checkInId ? me.activeCheckIn.roomId : null;
      const result = await withPresence(roomId, getFreshLocation, location => uploadSeatPhoto(checkInId, photo, location));
      if (mounted.current) {
        setMessage(result.verified ? { tone: "success", text: "¡Listo! Tu lugar quedó verificado con foto." } : { tone: "error", text: REASON_COPY[result.reason] ?? "No pudimos verificar la foto." });
        if (result.verified) setPhoto(null);
        onChanged();
      }
    } catch (error) { if (mounted.current) setMessage({ tone: "error", text: describeActionError(error) }); }
    finally { if (mounted.current) setPhase("idle"); }
  }
  return <section aria-label="Verificación por foto" className="flex flex-col gap-3 border-t border-app pt-4">
    <h3 className="text-sm font-semibold text-main">Verificá tu lugar con una foto</h3>
    <p className="text-sm leading-relaxed text-muted">Es opcional: tu lugar ya está marcado. Una verificación correcta lo protege de votaciones por hasta 2 horas, mientras siga vigente tu registro.</p>
    {statusFailed ? <button type="button" onClick={() => setStatusAttempt(n => n + 1)} className="min-h-11 text-left text-sm text-primary underline">No pudimos comprobar el servicio. Reintentar</button> : enabled === null ? <p role="status" className="text-sm text-muted">Comprobando disponibilidad…</p> : !enabled ? <p role="status" className="rounded-xl bg-surface-2 p-3 text-sm text-muted">La verificación por foto no está disponible por el momento. Podés seguir usando tu lugar normalmente.</p> : <>
      <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted"><li>Sacá la foto desde tu asiento, mirando hacia adelante sobre la mesa.</li><li>Incluí una referencia amplia: ventanas, entrada o mesas cercanas. Evitá fotografiar personas.</li><li>Revisá la vista previa y tocá “Verificar foto”.</li></ol>
      {photo ? <div className="overflow-hidden rounded-2xl border border-app bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- local JPEG preview, uploaded only after confirmation */}
        <img src={`data:image/jpeg;base64,${photo.base64}`} alt="Vista previa de la foto de tu lugar" width={640} height={400} className="aspect-[8/5] w-full object-contain"/>
        <p className="p-3 text-xs leading-relaxed text-muted">Al verificar, enviás esta imagen a {provider} para ubicar el asiento. La app no guarda la foto y elimina sus metadatos. No incluyas personas ni datos privados. <Link href="/privacidad#verificacion-foto" className="text-primary underline">Cómo se procesa la foto</Link>.</p>
      </div> : null}
      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => cameraRef.current?.click()} disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-app px-3 text-sm font-semibold disabled:opacity-50"><CameraIcon size={18} aria-hidden="true"/>{photo ? "Otra foto" : "Sacar foto"}</button><button type="button" onClick={() => galleryRef.current?.click()} disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-app px-3 text-sm font-semibold disabled:opacity-50"><ImageIcon size={18} aria-hidden="true"/>Elegir foto</button></div>
      <input ref={cameraRef} aria-label="Tomar foto del lugar" type="file" accept="image/*" capture="environment" hidden disabled={pending} onChange={event => { const file = event.target.files?.[0]; if (file) void selectPhoto(file); }}/>
      <input ref={galleryRef} aria-label="Elegir foto del lugar" type="file" accept="image/*" hidden disabled={pending} onChange={event => { const file = event.target.files?.[0]; if (file) void selectPhoto(file); }}/>
      {photo ? <button type="button" onClick={() => void verify()} disabled={pending} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50">{phase === "verifying" ? "Verificando…" : "Verificar foto"}</button> : null}
      {phase === "preparing" ? <p role="status" className="text-sm text-muted">Preparando la foto…</p> : null}
    </>}
    {message ? <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-xl bg-surface-2 p-3 text-sm leading-relaxed ${message.tone === "success" ? "text-primary" : "text-[var(--seat-occupied)]"}`}>{message.text}</p> : null}
  </section>;
}
