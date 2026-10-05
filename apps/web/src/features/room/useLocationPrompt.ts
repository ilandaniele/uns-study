import { useEffect, useState } from "react";

/** True while the browser would still ask for geolocation (permission state "prompt") and the viewer is logged in. */
export function useLocationPrompt(enabled: boolean): boolean {
  const [prompt, setPrompt] = useState(false);
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const sync = () => setPrompt(status?.state === "prompt");
    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (cancelled) return;
        status = result;
        sync();
        result.addEventListener("change", sync);
      })
      .catch(() => {
        // Unsupported (e.g. older Safari): no priming line.
      });
    return () => {
      cancelled = true;
      status?.removeEventListener("change", sync);
    };
  }, [enabled]);
  return enabled && prompt;
}
