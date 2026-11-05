"use client";

import type { GroupRankingDto, RankingCategory, RankingPeriod } from "@sala/contracts";
import { useEffect, useState } from "react";
import { isProRequired } from "@/features/pro/pro-api";
import { DataPaths } from "@/lib/prefetch";
import { fetchCached, peekCached } from "@/lib/query-cache";

const FRESH_MS = 30_000;

export interface UseGroupRankingResult {
  ranking: GroupRankingDto | null;
  loading: boolean;
  error: string | null;
  proRequired: boolean;
}

/** Fetches a group's ranking (Pro, signed in). Idle while `enabled` is false or there is no group. */
export function useGroupRanking(groupId: string | null, period: RankingPeriod, category: RankingCategory, enabled: boolean): UseGroupRankingResult {
  const active = enabled && !!groupId;
  const path = groupId ? DataPaths.groupRanking(groupId, period, category) : null;
  const [ranking, setRanking] = useState<GroupRankingDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proRequired, setProRequired] = useState(false);

  useEffect(() => {
    if (!active || !path) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the cached response for the new filters right away
    setRanking(peekCached<GroupRankingDto>(path) ?? null);
    setLoading(true);
    setError(null);
    setProRequired(false);
    let busy = false;
    const load = (maxAge = 0) => {
      if (busy || cancelled) return;
      busy = true;
      void fetchCached<GroupRankingDto>(path, maxAge)
      .then((dto) => {
        if (!cancelled) { setRanking(dto); setError(null); setProRequired(false); }
      })
      .catch((err) => {
        if (cancelled) return;
        if (isProRequired(err)) setProRequired(true);
        else setError("No pudimos cargar el ranking del grupo.");
      })
      .finally(() => {
        busy = false;
        if (!cancelled) setLoading(false);
      });
    };
    load(FRESH_MS);
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [active, path]);

  if (!active) return { ranking: null, loading: false, error: null, proRequired: false };
  return { ranking, loading, error, proRequired };
}
