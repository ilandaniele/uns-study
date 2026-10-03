"use client";

import { GAM_INTERSTITIAL_UNIT, GAM_REWARDED_UNIT } from "./ad-config";
import type { AdProvider, InterstitialOutcome, RewardOutcome } from "./ad-provider";
import { loadGpt, registerInterstitial, requestRewarded } from "./gpt";

export const gamProvider: AdProvider = {
  id: "gam",

  isAvailable(kind) {
    return kind === "rewarded" ? !!GAM_REWARDED_UNIT : !!GAM_INTERSTITIAL_UNIT;
  },

  async showInterstitial(placement): Promise<InterstitialOutcome> {
    // A GAM web interstitial cannot be triggered on demand, so the pre-check-in placement
    // always falls back to the house ad.
    if (placement !== "app_open" || !GAM_INTERSTITIAL_UNIT) return "unavailable";
    if (!(await loadGpt())) return "unavailable";
    return (await registerInterstitial(GAM_INTERSTITIAL_UNIT)) === "registered" ? "shown" : "unavailable";
  },

  async showRewarded(): Promise<RewardOutcome> {
    if (!GAM_REWARDED_UNIT) return "unavailable";
    if (!(await loadGpt())) return "unavailable";
    return requestRewarded(GAM_REWARDED_UNIT);
  },
};
