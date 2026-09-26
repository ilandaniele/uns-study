"use client";

import type { MeDto } from "@uns/contracts";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface AdminAccess {
  loading: boolean;
  isAdmin: boolean;
  me: MeDto | null;
}

/**
 * Client-side gate for `/admin/**`: fetches `/me` and checks `roles`. This is purely a UX
 * convenience (hide the admin UI from non-admins) — every admin endpoint re-checks the role
 * server-side via `AdminGuard`, so this hook is never the actual security boundary.
 */
export function useAdminAccess(): AdminAccess {
  const [me, setMe] = useState<MeDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MeDto>("/api/v1/me")
      .then((dto) => {
        if (!cancelled) setMe(dto);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = me?.roles.some((role) => role === "ADMIN" || role === "MODERATOR") ?? false;
  return { loading, isAdmin, me };
}
