"use client";

import { useSyncExternalStore } from "react";
import type { AdPlacement } from "./ad-provider";

export interface HouseInterstitialState {
  open: boolean;
  placement: AdPlacement | null;
  /** Seconds left on the close countdown when the ad comes back after its CTA was followed. */
  resumeRemaining?: number;
}

/** An ad left mid-countdown through its CTA, waiting for the visitor to come back to `path`. */
interface SuspendedAd {
  placement: AdPlacement;
  remaining: number;
  path: string;
  at: number;
}

const SUSPENDED_KEY = "sala.ads.suspended";
/** A visitor who stays away longer than this is not brought back to an old ad. */
const SUSPEND_TTL_MS = 30 * 60_000;

const CLOSED: HouseInterstitialState = { open: false, placement: null };

let state: HouseInterstitialState = CLOSED;
const listeners = new Set<() => void>();
const snoozeListeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(next: HouseInterstitialState): void {
  state = next;
  listeners.forEach((l) => l());
}

export function openHouseInterstitial(placement: AdPlacement): void {
  if (state.open) return;
  emit({ open: true, placement });
}

export function closeHouseInterstitial(): void {
  if (!state.open) return;
  emit(CLOSED);
}

/**
 * Closes the ad because its CTA navigated away while the countdown still ran, and remembers the
 * seconds left so going back to the same page shows it again (sessionStorage: survives a reload).
 */
export function suspendHouseInterstitial(remaining: number, path: string): void {
  if (!state.open || !state.placement) return;
  const suspended: SuspendedAd = { placement: state.placement, remaining, path, at: Date.now() };
  try {
    window.sessionStorage.setItem(SUSPENDED_KEY, JSON.stringify(suspended));
  } catch {
    // Storage blocked: the ad simply does not come back.
  }
  emit(CLOSED);
}

/** Reopens a suspended ad once the visitor is back on the page it was left on. */
export function resumeSuspendedHouseInterstitial(path: string): void {
  let suspended: SuspendedAd | null = null;
  try {
    const raw = window.sessionStorage.getItem(SUSPENDED_KEY);
    suspended = raw ? (JSON.parse(raw) as SuspendedAd) : null;
    if (!suspended) return;
    if (Date.now() - suspended.at > SUSPEND_TTL_MS) {
      window.sessionStorage.removeItem(SUSPENDED_KEY);
      return;
    }
    if (suspended.path !== path || state.open) return;
    window.sessionStorage.removeItem(SUSPENDED_KEY);
  } catch {
    return;
  }
  emit({ open: true, placement: suspended.placement, resumeRemaining: Math.max(1, Math.round(suspended.remaining)) });
}

/** Subscribers never get a suspended ad back. */
export function dropSuspendedHouseInterstitial(): void {
  try {
    window.sessionStorage.removeItem(SUSPENDED_KEY);
  } catch {
    // Nothing stored.
  }
}

export function useHouseInterstitial(): HouseInterstitialState {
  return useSyncExternalStore(subscribe, () => state, () => CLOSED);
}

/** Lets mounted `useAdFree` hooks re-read the snooze after a reward is granted. */
export function notifySnoozeChanged(): void {
  snoozeListeners.forEach((l) => l());
}

export function subscribeSnooze(listener: () => void): () => void {
  snoozeListeners.add(listener);
  return () => snoozeListeners.delete(listener);
}
