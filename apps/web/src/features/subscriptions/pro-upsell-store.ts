"use client";

import { useSyncExternalStore } from "react";
import type { ProFeatureId } from "./pro";

let current: ProFeatureId | null = null;
const listeners = new Set<() => void>();

function set(next: ProFeatureId | null) {
  if (next === current) return;
  current = next;
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function openProUpsell(feature: ProFeatureId) {
  set(feature);
}

export function closeProUpsell() {
  set(null);
}

export function useProUpsell(): ProFeatureId | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
