"use client";

import type { AnnouncementDto } from "@sala/contracts";
import { useEffect, useState } from "react";
import { AdSlot } from "@/components/AdSlot";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { ArrowRightIcon, ChatCircleIcon } from "@phosphor-icons/react/dist/ssr";

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
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-7 sm:pt-10">
      <p className="t-label text-primary">Estudiar, acompañados</p>
      <h1 className="mb-2 mt-2 text-3xl font-bold tracking-tight">Comunidad</h1>
      <p className="mb-6 text-sm text-muted">Conversaciones y novedades de nuestra sala.</p>
      <Link href="/chat" className="mb-7 flex min-h-24 items-center gap-4 rounded-2xl border border-app bg-surface p-5"><ChatCircleIcon size={30} aria-hidden="true" className="shrink-0 text-primary" /><span className="flex-1"><span className="block font-bold">La charla de la sala</span><span className="text-sm text-muted">Preguntá, compartí y encontrá tu grupo.</span></span><ArrowRightIcon size={20} aria-hidden="true" /></Link>
      <h2 className="mb-4 text-lg font-bold">Novedades</h2>

      {loading ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : announcements.length === 0 ? (
        <p className="text-sm text-muted">Por ahora no hay novedades.</p>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--border)] border-y border-app">
          {announcements.map((announcement, index) => (
            <div key={announcement.id} className="py-3">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-title">{announcement.title}</p>
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
