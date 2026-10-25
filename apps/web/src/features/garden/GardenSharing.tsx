"use client";
import { useState } from "react";
import Link from "next/link";

export function GardenSharing({ shared, userId, pending, onChange }: {
  shared: boolean; userId: string; pending: boolean; onChange: (shared: boolean) => Promise<boolean>;
}) {
  const [notice, setNotice] = useState("");
  async function share() {
    const url = `${window.location.origin}/u/${encodeURIComponent(userId)}/jardin`;
    try {
      if (navigator.share) await navigator.share({ title: "Mi bosque nativo", url });
      else { await navigator.clipboard.writeText(url); setNotice("Enlace copiado"); }
    } catch (e) { if ((e as DOMException).name !== "AbortError") setNotice("No pudimos compartir el enlace. Intentá de nuevo."); }
  }
  return <section className="mt-5 rounded-2xl border border-app bg-surface p-5" aria-label="Visibilidad del jardín">
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 font-semibold">
      Mostrar mi jardín<input type="checkbox" checked={shared} disabled={pending} onChange={e => { setNotice(""); void onChange(e.target.checked); }} className="h-6 w-6 accent-[var(--garden-accent)]" />
    </label>
    <p className="mt-1 text-sm text-muted">{shared ? "Otras personas de la sala pueden visitarlo desde tu perfil." : "Sólo vos podés verlo. Activá esta opción para recibir visitas."}</p>
    {shared ? <div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={() => void share()} className="min-h-11 rounded-full border border-app px-4 text-sm font-semibold">Compartir jardín</button><Link href={`/u/${encodeURIComponent(userId)}/jardin`} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary">Ver como visitante →</Link></div> : null}
    {notice ? <p role="status" className="mt-2 text-sm text-muted">{notice}</p> : null}
  </section>;
}
