"use client";

import { useSyncExternalStore } from "react";

export const CHAT_SOUND_KEY = "sala:chat-sound";

/** Stored "on" | "off"; missing or garbage means on. */
export function parseChatSound(raw: string | null): boolean {
  return raw !== "off";
}

export function readChatSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return parseChatSound(window.localStorage.getItem(CHAT_SOUND_KEY));
  } catch {
    return true;
  }
}

const listeners = new Set<() => void>();

export function setChatSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(CHAT_SOUND_KEY, on ? "on" : "off");
  } catch {
    // Blocked storage: the preference just won't persist.
  }
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CHAT_SOUND_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useChatSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, readChatSoundEnabled, () => true);
}
