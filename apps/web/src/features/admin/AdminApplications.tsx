"use client";
import type { AdminApplicationDto } from "@sala/contracts";
import { reviewAdminApplicationSchema } from "@sala/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPost } from "@/lib/api";

export function AdminApplications() {
  const [items, setItems] = useState<AdminApplicationDto[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const items = await apiFetch<AdminApplicationDto[]>("/api/v1/admin/admin-applications", { signal }); if (!signal?.aborted) { setItems(items); setError(""); } }
    catch { if (!signal?.aborted) setError("No pudimos cargar las solicitudes."); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts a request; state changes only after the response
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  async function review(item: AdminApplicationDto, approve: boolean) {
    if (!window.confirm(approve ? `¿Hacer administrador de la sala a ${item.displayName}? Podrá moderar y actualizar lugares; los permisos de propietario siguen siendo tuyos.` : `¿Descartar la solicitud de ${item.displayName}?`)) return;
    setPending(item.userId);
    try { await apiPost(`/api/v1/admin/admin-applications/${encodeURIComponent(item.userId)}/review`, { approve }, reviewAdminApplicationSchema); await load(); window.dispatchEvent(new Event("sala:admin-applications-updated")); }
    catch (error) { setError(error instanceof Error ? error.message : "No pudimos revisar la solicitud."); }
    finally { setPending(null); }
  }
  return <section><h2 className="text-xl font-bold">Solicitudes de colaboradores</h2><p className="mt-2 text-sm leading-relaxed text-muted">Llegan después de 100 lugares actualizados en al menos 3 días. Las insignias no conceden permisos: vos aprobás cada ascenso.</p>
    {error ? <p role="alert" className="mt-4 text-sm text-[var(--seat-occupied)]">{error} <button type="button" onClick={() => void load()} className="min-h-11 text-primary underline">Reintentar</button></p> : null}
    {items === null ? <p role="status" className="mt-5 text-sm text-muted">Cargando solicitudes…</p> : !items.length ? <p className="mt-5 rounded-2xl border border-app p-5 text-sm text-muted">No hay solicitudes pendientes.</p> : <ul className="mt-5 space-y-3">{items.map(item => <li key={item.userId} className="rounded-2xl border border-app bg-surface p-5"><Link href={`/u/${encodeURIComponent(item.userId)}`} className="font-semibold text-primary hover:underline">{item.displayName}</Link><p className="mt-2 text-sm text-muted">{item.places} lugares · {item.days} días de colaboración</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={pending !== null} onClick={() => void review(item, true)} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50">Aprobar como administrador</button><button type="button" disabled={pending !== null} onClick={() => void review(item, false)} className="min-h-11 rounded-full border border-app px-5 text-sm font-semibold disabled:opacity-50">Descartar</button></div></li>)}</ul>}
  </section>;
}
