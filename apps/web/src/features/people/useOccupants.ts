"use client";

import { SocketEvents, type SeatMarkedByDto, type SeatOccupancyDto, type SeatOccupantDto, type SeatStateChangedEvent } from "@sala/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";

/** How long to wait after the last relevant socket event before refetching (coalesces bursts). */
const REFETCH_DEBOUNCE_MS = 1000;

export interface UseOccupantsResult {
  /** seatId -> occupant, for every checked-in seat (hidden users have `userId: null`). */
  bySeatId: Map<string, SeatOccupantDto>;
  /** seatId -> who marked it "Está ocupado", for OCCUPIED seats with nobody checked in. */
  markedBySeatId: Map<string, SeatMarkedByDto>;
  refetch: () => void;
}

/** Keeps the previous object when an entry didn't change, so memoized seats don't repaint on every refetch. */
function reuseEqual<T>(previous: Map<string, T>, next: Map<string, T>): Map<string, T> {
  let reused = 0;
  for (const [key, value] of next) {
    const old = previous.get(key);
    if (old !== undefined && JSON.stringify(old) === JSON.stringify(value)) {
      next.set(key, old);
      reused++;
    }
  }
  // Same size and every entry reused: nothing changed, keep the old Map so consumers don't re-render.
  return reused === next.size && previous.size === next.size ? previous : next;
}

/** GET `/rooms/:idOrSlug/occupants` — seat badges, "<Nombre> está acá" and "Marcado por: …" in `SeatDetail`. */
export function useOccupants(roomSlug: string): UseOccupantsResult {
  const [bySeatId, setBySeatId] = useState<Map<string, SeatOccupantDto>>(new Map());
  const [markedBySeatId, setMarkedBySeatId] = useState<Map<string, SeatMarkedByDto>>(new Map());

  const load = useCallback(async () => {
    try {
      const dto = await apiFetch<SeatOccupancyDto[]>(`/api/v1/rooms/${roomSlug}/occupants`);
      const occupants = new Map<string, SeatOccupantDto>();
      const marked = new Map<string, SeatMarkedByDto>();
      for (const entry of dto) {
        if ("markedBy" in entry) marked.set(entry.seatId, entry);
        else occupants.set(entry.seatId, entry);
      }
      setBySeatId((previous) => reuseEqual(previous, occupants));
      setMarkedBySeatId((previous) => reuseEqual(previous, marked));
    } catch {
      // Occupants are a nice-to-have overlay on top of the seat map; a failed fetch just leaves it empty.
    }
  }, [roomSlug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount/slug change
    void load();
  }, [load]);

  // Debounced refetch on `seat:state-changed` (a check-in/checkout/dispute can change who's seated
  // where) and on socket reconnect (occupants may have changed while we were disconnected).
  // `table:nickname-changed` is irrelevant here — a table rename never changes who's occupying a seat.
  const bySeatIdRef = useRef(bySeatId);
  const markedRef = useRef(markedBySeatId);
  useEffect(() => {
    bySeatIdRef.current = bySeatId;
    markedRef.current = markedBySeatId;
  }, [bySeatId, markedBySeatId]);

  useEffect(() => {
    const socket = getSocket();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    // The very first `connect` is covered by the initial fetch; only a RE-connect can have missed events.
    let seenConnect = socket.connected;
    const scheduleReload = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => void load(), REFETCH_DEBOUNCE_MS);
    };
    // Only seats that become OCCUPIED (a new occupant / marker) or that we currently list
    // (occupant may have left) can change this overlay; other seat events are noise.
    const onSeatStateChanged = (event: SeatStateChangedEvent) => {
      if (event.status === "OCCUPIED" || bySeatIdRef.current.has(event.seatId) || markedRef.current.has(event.seatId)) scheduleReload();
    };
    const onConnect = () => {
      if (seenConnect) scheduleReload();
      seenConnect = true;
    };

    socket.on(SocketEvents.SeatStateChanged, onSeatStateChanged);
    socket.on("connect", onConnect);

    return () => {
      if (timeout) clearTimeout(timeout);
      socket.off(SocketEvents.SeatStateChanged, onSeatStateChanged);
      socket.off("connect", onConnect);
    };
  }, [load]);

  return { bySeatId, markedBySeatId, refetch: load };
}
