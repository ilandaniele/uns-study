"use client";

import { SocketEvents, type AnnouncementDto } from "@sala/contracts";
import type { Socket } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

/** Minimum gap between tab-visibility refetches. */
const VISIBILITY_REFETCH_MIN_MS = 60_000;

export interface AnnouncementsBannerProps {
  roomSlug: string;
  /** Optional shared Socket.IO connection; when provided, live updates arrive via
   *  `room:announcement-changed` instead of relying only on window focus refetches. */
  socket?: Socket | null;
}

/** Active announcements for a room, refreshed on `room:announcement-changed` (if a socket is
 *  passed in) and when the tab becomes visible again. Renders nothing when there are none. */
export function AnnouncementsBanner({ roomSlug, socket }: AnnouncementsBannerProps) {
  const [announcements, setAnnouncements] = useState<AnnouncementDto[]>([]);

  const load = useCallback(async () => {
    try {
      const items = await apiFetch<AnnouncementDto[]>(`/api/v1/rooms/${roomSlug}/announcements`);
      setAnnouncements(items);
    } catch {
      // Announcements are non-critical; fail silently and keep the last known list.
    }
  }, [roomSlug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount/slug change
    void load();
  }, [load]);

  // Revalidate when the tab becomes visible again, at most once per minute (socket events cover
  // live changes while it is open).
  const lastLoadRef = useRef(0);
  useEffect(() => {
    lastLoadRef.current = Date.now();
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastLoadRef.current < VISIBILITY_REFETCH_MIN_MS) return;
      lastLoadRef.current = now;
      void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onChanged = () => void load();
    socket.on(SocketEvents.AnnouncementChanged, onChanged);
    return () => {
      socket.off(SocketEvents.AnnouncementChanged, onChanged);
    };
  }, [socket, load]);

  if (announcements.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {announcements.map((announcement) => (
        <div
          key={announcement.id}
          className="rounded-control border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="font-semibold">{announcement.title}</p>
          <p className="whitespace-pre-wrap">{announcement.body}</p>
        </div>
      ))}
      <Link href="/comunidad" className="self-end text-xs text-muted underline underline-offset-2 hover:text-main">
        Ver novedades
      </Link>
    </div>
  );
}
