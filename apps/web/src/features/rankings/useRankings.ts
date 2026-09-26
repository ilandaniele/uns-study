"use client";

import type { RankingCategory, RankingDto, RankingPeriod } from "@uns/contracts";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface UseRankingsResult {
  ranking: RankingDto | null;
  loading: boolean;
  error: string | null;
}

/** Fetches the public ranking for a room + period + category combination. Public endpoint
 *  (no auth required), but includes `me` when the caller is signed in. */
export function useRankings(roomSlug: string, period: RankingPeriod, category: RankingCategory): UseRankingsResult {
  const [ranking, setRanking] = useState<RankingDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const dto = await apiFetch<RankingDto>(`/api/v1/rooms/${roomSlug}/rankings?period=${period}&category=${category}`);
        if (!cancelled) setRanking(dto);
      } catch {
        if (!cancelled) setError("No pudimos cargar el ranking.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [roomSlug, period, category]);

  return { ranking, loading, error };
}
