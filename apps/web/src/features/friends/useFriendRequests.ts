"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FriendsPageDto } from "@sala/contracts";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-store";
import { useFriendRefresh } from "./useFriendRefresh";

export function useFriendRequests() {
  const { me } = useMe();
  const userId = me?.user?.id;
  const [result, setResult] = useState<{ userId: string; count: number } | null>(null);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const refresh = useCallback(() => {
    if (!userId) return;
    const request = ++sequence.current;
    void apiFetch<FriendsPageDto>("/api/v1/me/friends?view=incoming", { cache: "no-store" })
      .then(dto => { if (request === sequence.current) setResult({ userId, count: dto.counts.incoming }); })
      .catch(() => { if (request === sequence.current) setResult({ userId, count: 0 }); });
  }, [userId]);
  useEffect(() => { refresh(); return invalidate; }, [refresh, invalidate]);
  useFriendRefresh(refresh, Boolean(userId));
  return result?.userId === userId ? result?.count ?? 0 : 0;
}
