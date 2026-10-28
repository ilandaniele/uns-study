"use client";

import { useEffect } from "react";

/** Registers `public/sw.js` only in production builds — dev keeps hot reload untouched. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    // `updateViaCache: "none"` makes the browser always re-check sw.js itself, so a fixed worker
    // replaces a broken one on the very next visit instead of whenever the HTTP cache expires.
    // Offline registration can be denied by the browser; the online app must still work.
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration?.update())
      .catch(() => undefined);
  }, []);

  return null;
}
