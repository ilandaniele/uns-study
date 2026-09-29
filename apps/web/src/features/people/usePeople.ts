"use client";

import type { RoomPersonDto } from "@uns/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { useMe } from "@/lib/me-store";

export interface UsePeopleResult {
  people: RoomPersonDto[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const SIGN_IN_MESSAGE = "Iniciá sesión para ver quién está en la sala.";

/** GET `/rooms/:idOrSlug/people` — registered users visible in the room right now. */
export function usePeople(roomSlug: string): UsePeopleResult {
  const { me, loading: meLoading } = useMe();
  const anonymous = !meLoading && !me?.user;
  const [people, setPeople] = useState<RoomPersonDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const dto = await apiFetch<RoomPersonDto[]>(`/api/v1/rooms/${roomSlug}/people`);
      setPeople(dto);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError && err.code === "UNAUTHENTICATED" ? SIGN_IN_MESSAGE : "No pudimos cargar la lista de personas.");
    } finally {
      setLoading(false);
    }
  }, [roomSlug]);

  useEffect(() => {
    if (meLoading) return;
    // Anonymous visitors can't see the list; skip the request that would only 401.
    if (anonymous) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from the shared /me result
      setError(SIGN_IN_MESSAGE);
      setLoading(false);
      return;
    }
    void load();
  }, [load, meLoading, anonymous]);

  const refetch = useCallback(() => {
    if (!anonymous) void load();
  }, [anonymous, load]);

  return { people, loading, error, refetch };
}
