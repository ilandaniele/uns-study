"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiFetch, apiPost } from "@/lib/api";

/** Matches `BlocksService.listBlocks` in the API (not part of `@sala/contracts`). */
export interface BlockedUserDto {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string;
}

export interface UseBlockedUsersResult {
  blockedIds: Set<string>;
  loading: boolean;
  block: (userId: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
}

/**
 * Loads the caller's block list once and exposes it as a `Set` for cheap membership checks,
 * used to hide a blocked author's messages client-side even where the API doesn't filter
 * realtime events itself (chat broadcasts reach every joined socket regardless of blocks).
 */
export function useBlockedUsers(): UseBlockedUsersResult {
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<BlockedUserDto[]>("/api/v1/me/blocks")
      .then((rows) => {
        if (!cancelled) setBlockedIds(new Set(rows.map((r) => r.userId)));
      })
      .catch(() => {
        // anonymous/unauthenticated callers simply see nobody as blocked
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const block = useCallback(async (userId: string) => {
    await apiPost(`/api/v1/users/${userId}/block`);
    setBlockedIds((prev) => new Set(prev).add(userId));
  }, []);

  const unblock = useCallback(async (userId: string) => {
    await apiDelete(`/api/v1/users/${userId}/block`);
    setBlockedIds((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  return { blockedIds, loading, block, unblock };
}
