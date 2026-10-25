"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GardenDto,
  GardenPlantRequest,
  GardenRedeemRequest,
} from "@sala/contracts";
import { apiFetch } from "@/lib/api";

export function useGarden() {
  const [garden, setGarden] = useState<GardenDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sequence = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(false);
  const invalidateRequest = useCallback(() => {
    sequence.current++;
  }, []);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    const request = ++sequence.current;
    try {
      const result = await apiFetch<GardenDto>("/api/v1/me/garden");
      if (mounted.current && sequence.current === request) {
        setGarden(result);
        setError(null);
      }
    } catch (e) {
      if (mounted.current && sequence.current === request)
        setError(
          e instanceof Error ? e.message : "No pudimos cargar el jardín.",
        );
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const request = ++sequence.current;
    void apiFetch<GardenDto>("/api/v1/me/garden")
      .then((result) => {
        if (mounted.current && sequence.current === request) {
          setGarden(result);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (mounted.current && sequence.current === request)
          setError(
            e instanceof Error ? e.message : "No pudimos cargar el jardín.",
          );
      });
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(visible, 60_000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      invalidateRequest();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, invalidateRequest]);

  async function act(
    action: "plant" | "redeem",
    input: GardenPlantRequest | GardenRedeemRequest,
  ): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    const request = ++sequence.current;
    setPending(true);
    setError(null);
    try {
      const result = await apiFetch<GardenDto>(`/api/v1/me/garden/${action}`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (mounted.current && sequence.current === request) setGarden(result);
      return true;
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "No se guardó el cambio. Intentá de nuevo.",
        );
      return false;
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return { garden, error, pending, refresh, act };
}
