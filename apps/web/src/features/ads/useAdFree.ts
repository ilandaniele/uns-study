"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/me-store";
import { subscribeSnooze } from "./ad-overlay-store";
import { getSnoozedUntil } from "./ad-policy";

export interface AdFreeState {
  /** True while ads must not render: `/me` still loading, subscriber, or reward snooze active. */
  hideAds: boolean;
  adFree: boolean;
  snoozedUntil: number | null;
  loading: boolean;
}

function readSnooze(): number | null {
  try {
    const until = getSnoozedUntil(window.localStorage);
    return until !== null && until > Date.now() ? until : null;
  } catch {
    return null;
  }
}

export function useAdFree(): AdFreeState {
  const { me, loading } = useMe();
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setSnoozedUntil(readSnooze());
    sync();
    const unsubscribe = subscribeSnooze(sync);
    window.addEventListener("storage", sync);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Let the snooze lapse on its own without a reload.
  useEffect(() => {
    if (snoozedUntil === null) return;
    const id = window.setTimeout(() => setSnoozedUntil(readSnooze()), Math.max(0, snoozedUntil - Date.now()) + 50);
    return () => window.clearTimeout(id);
  }, [snoozedUntil]);

  const adFree = me?.adFree === true;
  return { hideAds: loading || adFree || snoozedUntil !== null, adFree, snoozedUntil, loading };
}
