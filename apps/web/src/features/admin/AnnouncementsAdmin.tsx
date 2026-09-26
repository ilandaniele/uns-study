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
      <form onSubmit={(e) => void create(e)} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-700">Nuevo anuncio</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="Título"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          placeholder="Mensaje"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="submit" disabled={saving} className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Publicar
        </button>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">{item.title}</span>
              <span className={item.active ? "text-xs font-semibold text-green-600" : "text-xs text-slate-400"}>
                {item.active ? "Activo" : "Inactivo"}
              </span>
            </div>
            <p className="text-slate-600">{item.body}</p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => void toggleActive(item)} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                {item.active ? "Desactivar" : "Activar"}
              </button>
              <button type="button" onClick={() => void remove(item)} className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 ? <p className="px-4 py-3 text-sm text-slate-400">No hay anuncios todavía.</p> : null}
      </div>
    </div>
  );
}
