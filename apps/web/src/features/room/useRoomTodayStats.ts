"use client";

import type { RoomTodayStatsDto } from "@sala/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const REFRESH_MS = 5 * 60_000;
const visitKey = (slug: string) => `sala:visit:${slug}`;

/** Tells the API this browser opened the room today (once per local day; storage failures just skip the guard). */
async function recordVisitOncePerDay(slug: string): Promise<void> {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the device's timezone
  try {
    if (window.localStorage.getItem(visitKey(slug)) === today) return;
  } catch {
    // storage blocked: fall through and let the server de-duplicate
  }
  await apiFetch<void>(`/api/v1/rooms/${encodeURIComponent(slug)}/visits`, { method: "POST" });
  try {
    window.localStorage.setItem(visitKey(slug), today);
  } catch {
    // ignore
  }
}

export interface RoomTodayStats {
  visitorsToday: number | null;
  /** Observations the signed-in user posted today; `null` when anonymous or not loaded yet. */
  myContributionsToday: number | null;
  /** Optimistic +1 after a successful observation; the next fetch reconciles it. */
  bumpContribution: () => void;
}

/** Records today's visit, then loads (and every 5 minutes refreshes) the room's social-proof counters. Never throws. */
export function useRoomTodayStats(slug: string, signedIn: boolean): RoomTodayStats {
  const [stats, setStats] = useState<RoomTodayStatsDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await apiFetch<RoomTodayStatsDto>(`/api/v1/rooms/${encodeURIComponent(slug)}/stats/today`);
        if (!cancelled) setStats(next);
      } catch {
        // decorative data: keep whatever we had
      }
    };
    void (async () => {
      try {
        await recordVisitOncePerDay(slug);
      } catch {
        // best effort
      }
      await load();
    })();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [slug, signedIn]);

  const bumpContribution = useCallback(() => {
    setStats((prev) => ({ visitorsToday: prev?.visitorsToday ?? 0, myContributionsToday: (prev?.myContributionsToday ?? 0) + 1 }));
  }, []);

  return {
    visitorsToday: stats?.visitorsToday ?? null,
    myContributionsToday: signedIn ? (stats?.myContributionsToday ?? null) : null,
    bumpContribution,
  };
}
