"use client";

import { announcementSchema, type AnnouncementDto } from "@sala/contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, apiDelete, apiPost } from "@/lib/api";
import { announcementInstant } from "./announcement-schedule";

export function AnnouncementsAdmin() {
  const [items, setItems] = useState<AnnouncementDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [closesRoom, setClosesRoom] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const dtos = await apiFetch<AnnouncementDto[]>("/api/v1/admin/announcements");
      setItems(dtos);
    } catch {
      setError("No pudimos cargar los anuncios.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiPost("/api/v1/admin/announcements", {
        title: title.trim(), body: body.trim(), closesRoom,
        ...(closesRoom ? { startsAt: announcementInstant(startsAt), endsAt: announcementInstant(endsAt) ?? null } : {}),
      }, announcementSchema);
      setTitle("");
      setBody("");
      setClosesRoom(false);
      setStartsAt("");
      setEndsAt("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear el anuncio.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: AnnouncementDto) {
    setPendingId(item.id);
    setError(null);
    try {
      await apiFetch(`/api/v1/admin/announcements/${item.id}`, {
        method: "PATCH", body: JSON.stringify({ active: !item.active }),
      });
      await load();
    } catch { setError("No pudimos actualizar el anuncio. Reintentá."); }
    finally { setPendingId(null); }
  }

  async function remove(item: AnnouncementDto) {
    if (!window.confirm(`¿Eliminar «${item.title}»?${item.closesRoom ? " Se quitará este cierre extraordinario." : ""}`)) return;
    setPendingId(item.id);
    setError(null);
    try { await apiDelete(`/api/v1/admin/announcements/${item.id}`); await load(); }
    catch { setError("No pudimos eliminar el anuncio. Reintentá."); }
    finally { setPendingId(null); }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(e) => void create(e)} className="flex flex-col gap-3 border-t border-app pt-4">
        <p className="text-sm font-semibold text-main">Nuevo anuncio</p>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-app bg-surface p-3 text-sm font-semibold">
          <input type="checkbox" checked={closesRoom} onChange={e => setClosesRoom(e.target.checked)} className="size-5 accent-primary"/>
          Cierre extraordinario de la sala
        </label>
        {closesRoom ? <fieldset className="space-y-3 rounded-xl border border-primary/30 bg-surface p-4">
          <legend className="px-1 text-sm font-semibold">Cierre confirmado por la UNS</legend>
          <p className="text-xs leading-relaxed text-muted">El cartel será visible para todos y no se podrán marcar lugares mientras dure el cierre. Cargá sólo información confirmada; los comunicados de la UNS no se detectan automáticamente.</p>
          <p className="text-xs font-semibold text-main">Fechas y horas de Bahía Blanca (UTC−3)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">Inicio (vacío: ahora)
              <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} className="min-h-11 min-w-0 max-w-full rounded-lg border border-app bg-surface px-3 text-base text-main"/>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">Fin (vacío: hasta nuevo aviso)
              <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className="min-h-11 min-w-0 max-w-full rounded-lg border border-app bg-surface px-3 text-base text-main"/>
            </label>
          </div>
        </fieldset> : null}
        <label className="flex flex-col gap-1 text-xs text-muted">
          Título
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="Título"
            className="rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Mensaje
          <textarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            placeholder="Mensaje"
            className="rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Publicando…" : closesRoom ? "Publicar cierre" : "Publicar"}
        </button>
      </form>

      {error ? <p role="alert" className="text-sm text-[var(--seat-occupied)]">{error}</p> : null}

      <div className="flex flex-col divide-y divide-[var(--border)] border-y border-app">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-main">{item.title}</span>
              <span
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-app px-2.5 py-0.5 text-xs font-semibold"
                style={{ color: item.active ? "var(--seat-free)" : "var(--text-faint)" }}
              >
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.active ? "var(--seat-free)" : "var(--text-faint)" }}
                />
                {item.active ? "Activo" : "Inactivo"}
              </span>
            </div>
            <p className="text-muted">{item.body}</p>
            {item.closesRoom ? <p className="text-xs font-semibold text-primary">
              Cierre extraordinario · Desde {closureDate(item.startsAt)} · {item.endsAt ? `Hasta ${closureDate(item.endsAt)}` : "Hasta nuevo aviso"}
            </p> : null}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={pendingId !== null}
                onClick={() => void toggleActive(item)}
                className="rounded-md border border-app px-3 py-1 text-xs font-medium text-muted hover:bg-[var(--surface-2)] hover:text-main"
              >
                {item.active ? "Desactivar" : "Activar"}
              </button>
              <button
                type="button"
                disabled={pendingId !== null}
                onClick={() => void remove(item)}
                className="rounded-md border border-app px-3 py-1 text-xs font-medium text-[var(--seat-occupied)] hover:bg-[var(--surface-2)]"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">No hay anuncios todavía. Publicá el primero arriba.</p>
        ) : null}
      </div>
    </div>
  );
}

function closureDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
