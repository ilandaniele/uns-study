"use client";

import { useCallback, useSyncExternalStore } from "react";
import { AUTO_EXTEND_STORAGE_KEY, parseAutoExtendPrefs, serializeAutoExtendPrefs } from "./auto-extend";

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return parseAutoExtendPrefs(window.localStorage.getItem(AUTO_EXTEND_STORAGE_KEY)).enabled;
  } catch {
    return false; // storage blocked
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === AUTO_EXTEND_STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** The per-device "Sigo acá automático" switch, shared by the setting, the runtime and the banner. */
export function useAutoExtendEnabled(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => false);
  const setEnabled = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(AUTO_EXTEND_STORAGE_KEY, serializeAutoExtendPrefs({ enabled: next }));
    } catch {
      /* storage blocked: the switch just won't stick */
    }
    for (const l of listeners) l();
  }, []);
  return [enabled, setEnabled];
}
