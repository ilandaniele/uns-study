"use client";

import { SocketEvents, type AnnouncementDto } from "@uns/contracts";
import type { Socket } from "socket.io-client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface AnnouncementsBannerProps {
  roomSlug: string;
  /** Optional shared Socket.IO connection; when provided, live updates arrive via
   *  `room:announcement-changed` instead of relying only on window focus refetches. */
  socket?: Socket | null;
}

/** Active announcements for a room, refreshed on `room:announcement-changed` (if a socket is
 *  passed in) and whenever the tab regains focus. Renders nothing when there are none. */
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

  useEffect(() => {
    function onFocus() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
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
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="font-semibold">{announcement.title}</p>
          <p className="whitespace-pre-wrap">{announcement.body}</p>
        </div>
      ))}
    </div>
  );
}
