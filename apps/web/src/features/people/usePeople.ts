"use client";

import type { RoomPersonDto } from "@uns/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api";

export interface UsePeopleResult {
  people: RoomPersonDto[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** GET `/rooms/:idOrSlug/people` — registered users visible in the room right now. */
export function usePeople(roomSlug: string): UsePeopleResult {
  const [people, setPeople] = useState<RoomPersonDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const dto = await apiFetch<RoomPersonDto[]>(`/api/v1/rooms/${roomSlug}/people`);
      setPeople(dto);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError && err.code === "UNAUTHENTICATED" ? "Iniciá sesión para ver quién está en la sala." : "No pudimos cargar la lista de personas.");
    } finally {
      setLoading(false);
    }
  }, [roomSlug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount/slug change
    void load();
  }, [load]);

  return { people, loading, error, refetch: load };
}
