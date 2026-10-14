"use client";

import type { MeDto } from "@sala/contracts";
import { useEffect } from "react";
import { apiFetch } from "./api";
import { clearQueryCache } from "./query-cache";
import { createResource, useResource } from "./resource-cache";

// One shared `/api/v1/me` for Header, BottomNav, the room page, etc.
const meResource = createResource<MeDto>(() => apiFetch<MeDto>("/api/v1/me"));

/** Last known `/me` without fetching (`undefined` = not loaded yet or invalidated). */
export function peekMe(): MeDto | undefined {
  return meResource.getState().data;
}

/** Revalidates `/me` in the background, keeping the previous value visible meanwhile. */
export function refreshMe(): Promise<MeDto> {
  return meResource.refresh();
}

/** Patches the cached `/me` locally (optimistic check-in/checkout/extend); no-op until `/me` has loaded. */
export function mutateMe(updater: (current: MeDto) => MeDto): void {
  meResource.mutate(updater);
}

/** Forget the cached identity (sign-in/out, account deletion); mounted `useMe` hooks refetch. */
export function invalidateMe(): void {
  meResource.invalidate();
  clearQueryCache(); // cached responses belong to the previous identity
}

export interface UseMeResult {
  me: MeDto | null;
  loading: boolean;
}

export function useMe(): UseMeResult {
  const state = useResource(meResource);

  // Initial load (or retry after a failure) once per mount.
  useEffect(() => {
    void meResource.load().catch(() => undefined);
  }, []);

  // Refetch after `invalidateMe()` while the hook is mounted.
  const idle = state.data === undefined && !state.loading && state.error === undefined;
  useEffect(() => {
    if (idle) void meResource.load().catch(() => undefined);
  }, [idle]);

  return { me: state.data ?? null, loading: state.data === undefined && state.error === undefined };
}
