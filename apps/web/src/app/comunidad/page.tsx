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
      <h1 className="mb-2 font-display text-[22px] font-extrabold uppercase leading-none tracking-[0.01em] text-main">Comunidad</h1>
      <p className="mb-4 text-sm text-muted">Novedades y anuncios para toda la comunidad de la sala.</p>

      {loading ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : announcements.length === 0 ? (
        <p className="text-sm text-muted">Por ahora no hay novedades.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {announcements.map((announcement, index) => (
            <div key={announcement.id}>
              <div className="rounded-[14px] border border-app bg-surface px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-display font-semibold text-main">{announcement.title}</p>
                  <p className="shrink-0 font-mono text-xs text-muted">{formatAnnouncementDate(announcement.startsAt)}</p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{announcement.body}</p>
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

function formatAnnouncementDate(startsAt: string): string {
  const date = new Date(startsAt);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}
