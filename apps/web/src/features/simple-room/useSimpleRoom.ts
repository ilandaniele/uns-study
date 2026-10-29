"use client";
import { useEffect, useRef, useState } from "react";
import type { LocationInput, RoomMapDto, SimpleCheckInResult } from "@sala/contracts";
import { apiDelete, apiPost, ApiRequestError } from "@/lib/api";
import { describeActionError } from "@/lib/errors";
import { GeolocationRequestError } from "@/lib/geolocation";
import { mutateMe, refreshMe } from "@/lib/me-store";
import { hasCheckedInBefore, markCheckedIn } from "@/lib/engagement";
import { showPreCheckInAd } from "@/features/ads/ads";
import { refreshAchievements } from "@/features/badges/achievement-store";
import { simpleActionLocation } from "./simple-location";

export function useSimpleRoom(map: RoomMapDto | null, refetch: () => void) {
  const [pending, setPending] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Extract<SimpleCheckInResult, { outcome: "CONFIRM" }> | null>(null);
  const [challenge, setChallenge] = useState(false);
  const [locationHelp, setLocationHelp] = useState(false);
  const busy = useRef(false), alive = useRef(true);
  const retrySeat = useRef<string | undefined>(undefined);
  const attemptLocation = useRef<LocationInput | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; attemptLocation.current = null; }; }, []);

  async function enter(confirmedSeatId?: string, turnstileToken?: string): Promise<boolean> {
    if (!map || busy.current) return false;
    busy.current = true; setPending(true); setLocating(true); setError(null); setLocationHelp(false);
    try {
      if (!navigator.onLine) throw new TypeError("offline");
      if (!confirmedSeatId && !turnstileToken && hasCheckedInBefore()) showPreCheckInAd();
      const location = await simpleActionLocation(attemptLocation.current, Boolean(confirmedSeatId));
      if (!alive.current) return false;
      attemptLocation.current = location;
      setLocating(false);
      const result = await apiPost<SimpleCheckInResult>("/api/v1/checkins/simple", { roomId: map.room.id, location, showIdentity: true,
        ...(confirmedSeatId ? { confirmedSeatId } : {}), ...(turnstileToken ? { turnstileToken } : {}) });
      if (!alive.current) return false;
      setChallenge(false);
      if (result.outcome === "CONFIRM") { setConfirmation(result); refetch(); return true; }
      mutateMe(current => ({ ...current, activeCheckIn: result.checkIn }));
      attemptLocation.current = null;
      setConfirmation(null); markCheckedIn(); refreshAchievements();
      void refreshMe().catch(() => undefined); refetch();
      return true;
    } catch (cause) {
      if (!alive.current) return false;
      if (cause instanceof ApiRequestError && cause.code === "TURNSTILE_REQUIRED") {
        retrySeat.current = confirmedSeatId; setChallenge(true);
      } else {
        setError(describeActionError(cause));
        if (cause instanceof GeolocationRequestError && ["PERMISSION_DENIED", "UNAVAILABLE", "COARSE"].includes(cause.code)) setLocationHelp(true);
      }
      void refreshMe().catch(() => undefined); return false;
    } finally {
      busy.current = false;
      if (alive.current) { setPending(false); setLocating(false); }
    }
  }

  async function leave() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try {
      await apiDelete("/api/v1/checkins/current");
      if (!alive.current) return;
      mutateMe(current => ({ ...current, activeCheckIn: null }));
      void refreshMe().catch(() => undefined); refetch();
    } catch (cause) { if (alive.current) { setError(describeActionError(cause)); void refreshMe().catch(() => undefined); } }
    finally { busy.current = false; if (alive.current) setPending(false); }
  }
  return { pending, locating, error, confirmation, challenge, locationHelp, enter, leave,
    cancelConfirmation: () => { if (!busy.current) { attemptLocation.current = null; setConfirmation(null); setChallenge(false); setError(null); setLocationHelp(false); } },
    dismissLocationHelp: () => setLocationHelp(false), retryChallenge: (token: string) => enter(retrySeat.current, token) };
}
