"use client";

import type { SeatOccupantDto } from "@uns/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

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

  return { bySeatId, refetch: load };
}
