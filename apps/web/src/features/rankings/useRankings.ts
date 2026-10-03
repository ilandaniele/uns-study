"use client";

import type { RankingCategory, RankingDto, RankingPeriod } from "@sala/contracts";
import { useEffect, useState } from "react";
import { DataPaths } from "@/lib/prefetch";
import { fetchCached, peekCached } from "@/lib/query-cache";

/** Rankings are cached ~60 s server-side; a response this fresh (e.g. prefetched) isn't refetched. */
const FRESH_MS = 30_000;

export interface UseRankingsResult {
  ranking: RankingDto | null;
  loading: boolean;
  error: string | null;
}

/** Fetches the public ranking for a room + period + category combination. Public endpoint
 *  (no auth required), but includes `me` when the caller is signed in. A cached/prefetched
 *  response renders immediately while it revalidates. */
export function useRankings(roomSlug: string, period: RankingPeriod, category: RankingCategory): UseRankingsResult {
  const path = DataPaths.rankings(roomSlug, period, category);
  const [ranking, setRanking] = useState<RankingDto | null>(() => peekCached<RankingDto>(path) ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = peekCached<RankingDto>(path);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the cached response for the new filters right away
    if (cached) setRanking(cached);
    setLoading(true);
    setError(null);
    fetchCached<RankingDto>(path, FRESH_MS)
      .then((dto) => {
        if (!cancelled) setRanking(dto);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar el ranking.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { ranking, loading, error };
}
