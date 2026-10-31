"use client";

import type { AchievementsDto } from "@sala/contracts";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";

const listeners = new Set<() => void>();
const empty = { userId: null as string | null, data: null as AchievementsDto | null, error: "", at: 0 };
let state = empty;
let inflight: { userId: string; promise: Promise<void>; refreshQueued: boolean } | null = null;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function publish(next: typeof state) { state = next; for (const listener of listeners) listener(); }
async function load(userId: string, force = false): Promise<void> {
  if (inflight?.userId === userId) {
    if (force) inflight.refreshQueued = true;
    return inflight.promise;
  }
  if (!force && state.userId === userId && Date.now() - state.at < 30_000) return;
  if (state.userId !== userId) publish({ ...empty, userId });
  const promise: Promise<void> = apiFetch<AchievementsDto>("/api/v1/me/achievements").then(data => {
    if (!Array.isArray(data.badges) || !data.collaboration) throw new Error("Invalid achievements response");
    if (state.userId === userId) publish({ userId, data, error: "", at: Date.now() });
  }).catch(() => {
    if (state.userId === userId) publish({ ...state, error: "No pudimos cargar las insignias. Probá de nuevo.", at: Date.now() });
  }).finally(async () => {
    if (inflight?.promise !== promise) return;
    const refreshQueued = inflight.refreshQueued;
    inflight = null;
    // A report may finish while the old snapshot is loading. Coalesce its refreshes into
    // one follow-up read, so that snapshot cannot hide a newly earned reward.
    if (refreshQueued && state.userId === userId) await load(userId, true);
  });
  inflight = { userId, promise, refreshQueued: false };
  return promise;
}
export function refreshAchievements() { window.dispatchEvent(new Event("sala:achievements-refresh")); }
export function useAchievements(userId: string | null) {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => empty);
  useEffect(() => { if (userId) void load(userId); else publish(empty); }, [userId]);
  const refresh = useCallback(() => userId ? load(userId, true) : Promise.resolve(), [userId]);
  return { data: snapshot.userId === userId ? snapshot.data : null, error: snapshot.userId === userId ? snapshot.error : "", refresh };
}
