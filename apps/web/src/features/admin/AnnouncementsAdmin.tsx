"use client";

import type { AnnouncementDto } from "@uns/contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, apiDelete, apiPost } from "@/lib/api";

export function AnnouncementsAdmin() {
  const [items, setItems] = useState<AnnouncementDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

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
    try {
      await apiPost("/api/v1/admin/announcements", { title: title.trim(), body: body.trim() });
      setTitle("");
      setBody("");
      await load();
    } catch {
      setError("No pudimos crear el anuncio.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: AnnouncementDto) {
    await apiFetch(`/api/v1/admin/announcements/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !item.active }),
    });
    await load();
  }

  async function remove(item: AnnouncementDto) {
    await apiDelete(`/api/v1/admin/announcements/${item.id}`);
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(e) => void create(e)} className="flex flex-col gap-3 rounded-[14px] border border-app bg-surface p-4">
        <p className="text-sm font-semibold text-main">Nuevo anuncio</p>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Título
          <input
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
          Publicar
        </button>
      </form>

      {error ? <p className="text-sm text-[var(--seat-occupied)]">{error}</p> : null}

      <div className="flex flex-col divide-y divide-[var(--border)] rounded-[14px] border border-app bg-surface">
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
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => void toggleActive(item)}
                className="rounded-md border border-app px-3 py-1 text-xs font-medium text-muted hover:bg-[var(--surface-2)] hover:text-main"
              >
                {item.active ? "Desactivar" : "Activar"}
              </button>
              <button
                type="button"
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
