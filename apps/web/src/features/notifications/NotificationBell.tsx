"use client";

import type { AnnouncementDto } from "@sala/contracts";
import { BellIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { useMe } from "@/lib/me-store";
import { hasUnseen, isCacheFresh, markSeen, readCache, readSeenIds, writeCache, type AnnouncementsCache } from "./notifications";

const ROOM_SLUG = "principal";

// Module-level cache: shared across remounts (route changes) within the page session.
let memoryCache: AnnouncementsCache | null = null;
let inflight: Promise<AnnouncementsCache | null> | null = null;

function getStore(kind: "session" | "local"): Storage | null {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

/** Returns cached announcements when fresh; otherwise fetches (deduplicated) and caches them. */
async function loadAnnouncements(): Promise<AnnouncementsCache | null> {
  const now = Date.now();
  if (!isCacheFresh(memoryCache, now)) memoryCache = readCache(getStore("session"));
  if (isCacheFresh(memoryCache, now)) return memoryCache;
  if (!inflight) {
    inflight = apiFetch<AnnouncementDto[]>(`/api/v1/rooms/${ROOM_SLUG}/announcements`)
      .then((items) => {
        memoryCache = { fetchedAt: Date.now(), items };
        writeCache(getStore("session"), memoryCache);
        return memoryCache;
      })
      .catch(() => memoryCache) // non-critical: keep the last known list
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });

/** Header bell listing active admin announcements, with a dot while some haven't been seen. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AnnouncementDto[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const { me } = useMe();
  const [applicationCount, setApplicationCount] = useState(0);
  useEffect(() => {
    if (!me?.isSuperAdmin) return;
    let cancelled = false;
    const update = () => {
      if (document.visibilityState !== "visible") return;
      void apiFetch<{ count: number }>("/api/v1/admin/admin-applications/count").then(dto => { if (!cancelled) setApplicationCount(dto.count); }).catch(() => undefined);
    };
    update();
    const timer = setInterval(update, 60_000);
    window.addEventListener("sala:admin-applications-updated", update);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("sala:admin-applications-updated", update); };
  }, [me?.isSuperAdmin, open]);

  const refresh = useCallback(async () => {
    const cache = await loadAnnouncements();
    if (cache) setItems(cache.items);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial read of client-only storage + cached fetch
    setSeen(readSeenIds(getStore("local")));
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    // Refetches only if the cache is stale.
    void refresh();
    setSeen(markSeen(getStore("local"), items.map((a) => a.id)));
  }

  // While open, anything that arrives (stale refetch) counts as seen too.
  useEffect(() => {
    if (!open || items.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mark newly arrived items as seen while the panel is open
    setSeen(markSeen(getStore("local"), items.map((a) => a.id)));
  }, [open, items]);

  const showDot = !open && (hasUnseen(items, seen) || (me?.isSuperAdmin && applicationCount > 0));

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-label="Novedades"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-app text-main hover:bg-[var(--surface-2)]"
      >
        <BellIcon aria-hidden="true" size={20} weight="regular" />
        {showDot ? <span aria-hidden="true" className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-red-500" /> : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Novedades"
          className="fixed inset-x-3 top-16 z-40 max-h-[70vh] overflow-y-auto rounded-lg border border-app bg-surface p-3 text-sm text-main shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
        >
          {me?.isSuperAdmin && applicationCount > 0 ? <Link href="/admin/colaboradores" onClick={() => setOpen(false)} className="mb-3 block rounded-xl border border-app bg-surface-2 p-3 font-semibold text-primary">{applicationCount} {applicationCount === 1 ? "solicitud de colaboración pendiente" : "solicitudes de colaboración pendientes"}</Link> : null}
          {items.length === 0 ? (
            <p className="text-muted">No hay novedades por ahora.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((a) => (
                <li key={a.id} className="min-w-0">
                  <p className="font-bold">{a.title}</p>
                  <p className="whitespace-pre-wrap break-words">{a.body}</p>
                  <p className="mt-0.5 text-xs text-muted">{dateFormat.format(new Date(a.startsAt))}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
