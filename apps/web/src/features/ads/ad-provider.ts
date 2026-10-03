import { gamProvider } from "./gam-provider";
import { houseProvider } from "./house-provider";

export type AdPlacement = "app_open" | "pre_checkin" | "rewarded";
/** "unavailable" means the caller falls back to the house ad. */
export type InterstitialOutcome = "shown" | "unavailable";
export type RewardOutcome = "granted" | "closed" | "unavailable";

export interface AdProvider {
  readonly id: "gam" | "house";
  isAvailable(kind: "interstitial" | "rewarded"): boolean;
  showInterstitial(placement: "app_open" | "pre_checkin"): Promise<InterstitialOutcome>;
  showRewarded(): Promise<RewardOutcome>;
}

/** GAM when it has a unit for that kind, otherwise the house provider. */
export function getAdProvider(kind: "interstitial" | "rewarded" = "interstitial"): AdProvider {
  return gamProvider.isAvailable(kind) ? gamProvider : houseProvider;
}
