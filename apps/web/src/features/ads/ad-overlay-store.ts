"use client";

import { useSyncExternalStore } from "react";
import type { AdPlacement } from "./ad-provider";

export interface HouseInterstitialState {
  open: boolean;
  placement: AdPlacement | null;
}

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
