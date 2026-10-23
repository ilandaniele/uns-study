"use client";

import { SocketEvents, type RoomPersonDto } from "@sala/contracts";
import { useCallback, useEffect, useState } from "react";
import { ApiRequestError } from "@/lib/api";
import { DataPaths } from "@/lib/prefetch";
import { fetchCached, peekCached } from "@/lib/query-cache";
import { useMe } from "@/lib/me-store";
import { getSocket } from "@/lib/socket";

export interface UsePeopleResult {
  people: RoomPersonDto[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const SIGN_IN_MESSAGE = "Iniciá sesión para ver quién está en la sala.";

/** A list this fresh (typically prefetched on link hover) is used without refetching. */
const FRESH_MS = 10_000;

/** GET `/rooms/:idOrSlug/people` — registered users visible in the room right now. A cached
 *  list renders instantly while it revalidates. */
export function usePeople(roomSlug: string): UsePeopleResult {
  const { me, loading: meLoading } = useMe();
  const anonymous = !meLoading && !me?.user;
  const path = DataPaths.people(roomSlug);
  const [people, setPeople] = useState<RoomPersonDto[]>(() => peekCached<RoomPersonDto[]>(path) ?? []);
  const [loading, setLoading] = useState(() => peekCached(path) === undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (maxAgeMs = 0) => {
    try {
      const dto = await fetchCached<RoomPersonDto[]>(path, maxAgeMs);
      setPeople(dto);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError && err.code === "UNAUTHENTICATED" ? SIGN_IN_MESSAGE : "No pudimos cargar la lista de personas.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (meLoading) return;
    // Anonymous visitors can't see the list; skip the request that would only 401.
    if (anonymous) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from the shared /me result
      setError(SIGN_IN_MESSAGE);
      setLoading(false);
      return;
    }
    void load(FRESH_MS);
  }, [load, meLoading, anonymous]);

  const refetch = useCallback(() => {
    if (!anonymous) void load();
  }, [anonymous, load]);

  // Attendance can expire while this page stays mounted. A list loaded once on
  // mount must not keep yesterday's people after check-out, reset or reconnect.
  useEffect(() => {
    if (anonymous || meLoading) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { void load(); }, 500); };
    const visible = () => { if (!document.hidden) refresh(); };
    const socket = getSocket();
    socket.on(SocketEvents.SeatStateChanged, refresh);
    socket.on(SocketEvents.RoomDailyReset, refresh);
    socket.on("connect", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      socket.off(SocketEvents.SeatStateChanged, refresh);
      socket.off(SocketEvents.RoomDailyReset, refresh);
      socket.off("connect", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [anonymous, meLoading, load]);

  return { people, loading, error, refetch };
}
