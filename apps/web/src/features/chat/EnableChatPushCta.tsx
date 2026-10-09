"use client";

import { useEffect, useState } from "react";
import { enablePushNotificationsDetailed, getPushSupportState, pushFailureMessage } from "@/lib/push";

/** List row offering to turn on push for new private/group messages. Renders nothing unless push is
 *  possible on this device and it isn't subscribed yet. Must sit inside a `<ul>`. */
export function EnableChatPushCta() {
  const [needed, setNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (getPushSupportState() !== "available") return;
    let cancelled = false;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setNeeded(subscription === null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needed) return null;

  async function handleEnable() {
    setBusy(true);
    setFailed(null);
    try {
      const result = await enablePushNotificationsDetailed();
      if (result.ok) setNeeded(false);
      else setFailed(pushFailureMessage(result));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col items-start gap-2 bg-[var(--surface-2)] px-4 py-3">
      <p className="text-xs text-muted">Activá las notificaciones para enterarte de mensajes nuevos</p>
      <button
        type="button"
        onClick={() => void handleEnable()}
        disabled={busy}
        className="rounded-lg bg-primary min-h-11 px-3.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 lg:min-h-9 lg:text-xs"
      >
        {busy ? "Activando…" : "Activar notificaciones"}
      </button>
      {failed ? <p role="status" className="text-xs text-red-600">{failed}</p> : null}
    </li>
  );
}
