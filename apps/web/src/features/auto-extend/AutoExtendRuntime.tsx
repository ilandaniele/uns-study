"use client";

import { extendRequestSchema, type CheckInDto } from "@sala/contracts";
import { useEffect, useRef } from "react";
import { apiPost } from "@/features/pro/pro-api";
import { getFreshLocation } from "@/lib/geolocation";
import { mutateMe, peekMe, useMe } from "@/lib/me-store";
import { AUTO_EXTEND_TICK_MS, shouldAttempt } from "./auto-extend";
import { useAutoExtendEnabled } from "./useAutoExtendPrefs";

interface AttemptState {
  checkInId: string;
  attempts: number;
  lastAttemptAt: number | null;
}

function isCheckIn(value: unknown): value is CheckInDto {
  return typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string" && "expiresAt" in value;
}

/**
 * Pro: renews the check-in on its own when 15 minutes or less remain, with a fresh GPS fix the
 * server validates against the geofence. Runs only while the tab is visible. Any failure just
 * records the attempt; the "¿Seguís acá?" banner and the 10-minute push stay as the fallback.
 */
export function AutoExtendRuntime() {
  const { me } = useMe();
  const [enabled] = useAutoExtendEnabled();
  const active = enabled && me?.pro === true && me.activeCheckIn != null;
  const state = useRef<AttemptState | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!active) return;

    const tick = async () => {
      if (inFlight.current || document.visibilityState !== "visible") return;
      const checkIn = peekMe()?.activeCheckIn;
      if (!checkIn) return;
      if (state.current?.checkInId !== checkIn.id) state.current = { checkInId: checkIn.id, attempts: 0, lastAttemptAt: null };
      const attempt = state.current;
      const now = Date.now();
      if (!shouldAttempt({ now, expiresAt: new Date(checkIn.expiresAt).getTime(), lastAttemptAt: attempt.lastAttemptAt, attempts: attempt.attempts })) return;

      inFlight.current = true;
      attempt.attempts += 1;
      attempt.lastAttemptAt = now;
      try {
        const location = await getFreshLocation();
        const dto = await apiPost<unknown>("/api/v1/checkins/current/extend", { auto: true, location }, extendRequestSchema);
        if (isCheckIn(dto)) mutateMe((current) => ({ ...current, activeCheckIn: dto }));
        attempt.attempts = 0;
        attempt.lastAttemptAt = null;
      } catch {
        // GPS denied, outside the room, rate limited...: stay quiet and let the manual flow cover it.
      } finally {
        inFlight.current = false;
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), AUTO_EXTEND_TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);

  return null;
}
