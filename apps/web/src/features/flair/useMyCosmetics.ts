"use client";

import type { MyCosmeticsDto, ProfileFlairRequest } from "@sala/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPut, isProRequired } from "@/features/pro/pro-api";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { useMe } from "@/lib/me-store";

const PATH = "/api/v1/me/cosmetics";

/** The signed-in user's saved "Perfil destacado" choice. Loads once signed in; `save` PUTs and keeps the response. */
export function useMyCosmetics(): {
  data: MyCosmeticsDto | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  save: (next: ProfileFlairRequest) => Promise<void>;
} {
  const { me } = useMe();
  const userId = me?.user?.id ?? null;
  const [data, setData] = useState<MyCosmeticsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the request started below
    setLoading(true);
    apiFetch<MyCosmeticsDto>(PATH)
      .then((dto) => {
        if (!cancelled) setData(dto);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar tu perfil destacado. Probá de nuevo más tarde.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const save = useCallback(async (next: ProfileFlairRequest) => {
    setSaving(true);
    setError(null);
    try {
      setData(await apiPut<MyCosmeticsDto>(PATH, next));
    } catch (err) {
      if (isProRequired(err)) openProUpsell("profile_flair");
      else setError(err instanceof Error && err.message ? err.message : "No pudimos guardar el cambio. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }, []);

  return { data, loading, saving, error, save };
}
