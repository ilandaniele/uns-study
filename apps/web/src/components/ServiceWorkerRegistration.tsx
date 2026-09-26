"use client";

import { useEffect } from "react";

/** Registers `public/sw.js` only in production builds — dev keeps hot reload untouched. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js");
  }, []);

  return null;
}
