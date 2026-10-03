"use client";

import { openHouseInterstitial } from "./ad-overlay-store";
import type { AdProvider } from "./ad-provider";

/** Our own promo: always available for interstitials, never grants a reward. */
export const houseProvider: AdProvider = {
  id: "house",

  isAvailable(kind) {
    return kind === "interstitial";
  },

  async showInterstitial(placement) {
    openHouseInterstitial(placement);
    return "shown";
  },

  async showRewarded() {
    return "unavailable";
  },
};
