"use client";

import type { MeDto } from "@sala/contracts";
import { useMe } from "@/lib/me-store";

export interface AdminAccess {
  loading: boolean;
  isAdmin: boolean;
  me: MeDto | null;
}

/**
 * Client-side gate for `/admin/**`: reads the shared `/me` and checks `roles`. This is purely a UX
 * convenience (hide the admin UI from non-admins) — every admin endpoint re-checks the role
 * server-side via `AdminGuard`, so this hook is never the actual security boundary.
 */
export function useAdminAccess(): AdminAccess {
  const { me, loading } = useMe();
  const isAdmin = me?.roles.some((role) => role === "ADMIN" || role === "MODERATOR") ?? false;
  return { loading, isAdmin, me };
}
