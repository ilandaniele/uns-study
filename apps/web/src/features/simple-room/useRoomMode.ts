"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomModeDto } from "@sala/contracts";
import { apiFetch } from "@/lib/api";

/** Account-bound server preference; never reuse another account's choice on a shared device. */
export function useRoomMode(userId: string | null) {
  const [snapshot, setSnapshot] = useState<{ userId: string; mode: RoomModeDto["mode"] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const writing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!userId) return;
    let alive = true, reading = false;
    const load = async () => {
      if (writing.current || reading) return;
      reading = true;
      const version = generation.current;
      try {
        const dto = await apiFetch<RoomModeDto>("/api/v1/me/room-mode");
        if (alive && version === generation.current) { setSnapshot({ userId, mode: dto.mode }); setError(null); }
      } catch {
        if (alive && version === generation.current) {
          // Keep the room usable if preferences are temporarily unavailable.
          setSnapshot(current => current?.userId === userId ? current : { userId, mode: "COMMON" });
          setError("No pudimos leer tu modo guardado. Podés seguir usando la sala y reintentar el cambio.");
        }
      } finally { reading = false; }
    };
    void load();
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, [userId]);

  const change = useCallback(async (mode: RoomModeDto["mode"]) => {
    if (!userId || writing.current) return;
    writing.current = true; generation.current++; setSaving(true); setError(null);
    try {
      const dto = await apiFetch<RoomModeDto>("/api/v1/me/room-mode", { method: "PATCH", body: JSON.stringify({ mode }) });
      if (mounted.current) setSnapshot({ userId, mode: dto.mode });
    } catch { if (mounted.current) setError("No pudimos guardar el modo. Probá de nuevo."); }
    finally { writing.current = false; if (mounted.current) setSaving(false); }
  }, [userId]);
  return { mode: userId && snapshot?.userId === userId ? snapshot.mode : "COMMON" as const,
    loading: Boolean(userId && snapshot?.userId !== userId), saving, error: userId ? error : null, change };
}
