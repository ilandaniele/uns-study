const KEY = "sala:how-to-seen:v1";

/** True when this browser has not seen the "Cómo usar la app" guide yet. Storage errors count as seen, so a blocked store never nags. */
export function shouldShowHowToOnFirstVisit(storage: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  try {
    return storage != null && storage.getItem(KEY) == null;
  } catch {
    return false;
  }
}

export function markHowToSeen(storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, "1");
  } catch {
    // Private mode or blocked storage: the guide may show again next visit, which is harmless.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Fired on `window` when the guide that opened on its own for a first-time visitor is closed. */
export const FIRST_VISIT_HOW_TO_CLOSED = "sala:first-visit-how-to-closed";
