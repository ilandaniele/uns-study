"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useNotificationPreferences } from "@/features/notifications/useNotificationPreferences";
import { enablePushNotifications, getPushSupportState } from "@/lib/push";

/** Small CTA shown on the room page once it has 0 free seats: one tap turns on the "seat freed"
 *  preference (and, if push is available, also subscribes this device). Signed-out visitors get
 *  nothing here — preferences require an account. */
export function EnableSeatFreedCta() {
  const { data: session } = useSession();
  const { preferences, update } = useNotificationPreferences();
  const [message, setMessage] = useState<string | null>(null);

  if (!session?.user || !preferences || (preferences.seatFreed && !message)) return null;
  if (message) return <p role="status" className="self-start text-sm text-muted">{message}</p>;

  async function handleEnable() {
    // Push first, while the click's user activation still allows the permission prompt.
    let pushed = false;
    if (getPushSupportState() === "available") {
      pushed = await enablePushNotifications();
    }
    await update({ seatFreed: true });
    setMessage(
      pushed
        ? "Listo, te avisamos cuando se libere un lugar."
        : "Listo. Vas a ver el aviso cuando tengas la app abierta.",
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleEnable()}
      className="self-start rounded-control border border-app bg-surface min-h-11 px-3.5 text-sm font-semibold text-main lg:min-h-9 lg:text-xs hover:bg-[var(--surface-2)]"
    >
      Avisame cuando se libere un lugar
    </button>
  );
}
