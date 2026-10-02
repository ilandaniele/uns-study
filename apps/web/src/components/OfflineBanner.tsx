"use client";

import { useEffect, useState } from "react";

/** Shows a small banner while `navigator.onLine` is false. Purely informational — only what this tab
 *  already loaded stays on screen (possibly stale); no data cache is promised. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to a browser API not available during SSR/first render
    setOffline(!navigator.onLine);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-white">
      Sin conexión — ves lo que ya cargó en esta pestaña, puede estar desactualizado
    </div>
  );
}
