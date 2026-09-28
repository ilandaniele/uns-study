"use client";

import type { AnnouncementDto } from "@uns/contracts";
import { useEffect, useState } from "react";
import { AdSlot } from "@/components/AdSlot";
import { apiFetch } from "@/lib/api";

const ROOM_SLUG = "principal";

/** Public community feed: active announcements (global + room), with a native ad slot after the first item. */
export default function ComunidadPage() {
  const [announcements, setAnnouncements] = useState<AnnouncementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AnnouncementDto[]>(`/api/v1/rooms/${ROOM_SLUG}/announcements`)
      .then((items) => {
        if (!cancelled) setAnnouncements(items);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar las novedades.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-1 font-display text-xl font-semibold text-slate-900">Comunidad</h1>
      <p className="mb-4 text-sm text-slate-500">Novedades y anuncios para toda la comunidad de la sala.</p>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : announcements.length === 0 ? (
        <p className="text-sm text-slate-500">Por ahora no hay novedades.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {announcements.map((announcement, index) => (
            <div key={announcement.id}>
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">{announcement.title}</p>
                <p className="whitespace-pre-wrap">{announcement.body}</p>
              </div>
              {index === 0 ? (
                <div className="mt-3">
                  <AdSlot placement="community-feed" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
