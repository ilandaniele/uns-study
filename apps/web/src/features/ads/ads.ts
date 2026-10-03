"use client";

import { peekMe } from "@/lib/me-store";
import { openHouseInterstitial } from "./ad-overlay-store";
import { markShown, shouldShowPreCheckIn } from "./ad-policy";
import { getAdProvider } from "./ad-provider";

/**
 * Fire-and-forget: shows the pre-check-in ad when the policy allows. It never throws and callers
 * must not await it, so the check-in is never delayed.
 */
export function showPreCheckInAd(): void {
  try {
    const me = peekMe();
    // Unknown `/me` or a subscriber: no ad.
    if (!me || me.adFree) return;
    const now = Date.now();
    const storage = window.localStorage;
    if (!shouldShowPreCheckIn({ now, storage })) return;
    markShown("pre_checkin", now, storage);
    void getAdProvider("interstitial")
      .showInterstitial("pre_checkin")
      .then((outcome) => {
        if (outcome === "unavailable") openHouseInterstitial("pre_checkin");
      })
      .catch(() => openHouseInterstitial("pre_checkin"));
  } catch {
    // Ads are best effort.
  }
}
