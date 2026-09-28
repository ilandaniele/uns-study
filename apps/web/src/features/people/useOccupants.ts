"use client";

import { SocketEvents, type SeatOccupantDto } from "@uns/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";

/** How long to wait after the last relevant socket event before refetching (coalesces bursts). */
const REFETCH_DEBOUNCE_MS = 1000;

export interface UseOccupantsResult {
  /** seatId -> occupant, for the seats whose occupant chose to be identified. */
  bySeatId: Map<string, SeatOccupantDto>;
  refetch: () => void;
}

/** GET `/rooms/:idOrSlug/occupants` — used by `SeatDetail` to show "<Nombre> está acá" when visible. */
export function useOccupants(roomSlug: string): UseOccupantsResult {
  const [bySeatId, setBySeatId] = useState<Map<string, SeatOccupantDto>>(new Map());

  const load = useCallback(async () => {
    try {
      const dto = await apiFetch<SeatOccupantDto[]>(`/api/v1/rooms/${roomSlug}/occupants`);
      setBySeatId(new Map(dto.map((o) => [o.seatId, o])));
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
  useEffect(() => {
    const socket = getSocket();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => void load(), REFETCH_DEBOUNCE_MS);
    };

    socket.on(SocketEvents.SeatStateChanged, scheduleReload);
    socket.on("connect", scheduleReload);

    return () => {
      if (timeout) clearTimeout(timeout);
      socket.off(SocketEvents.SeatStateChanged, scheduleReload);
      socket.off("connect", scheduleReload);
    };
  }, [load]);

  return { bySeatId, refetch: load };
}
