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
  const [done, setDone] = useState(false);

  if (!session?.user || !preferences || preferences.seatFreed || done) return null;

  async function handleEnable() {
    await update({ seatFreed: true });
    if (getPushSupportState() === "available") {
      await enablePushNotifications().catch(() => undefined);
    }
    setDone(true);
  }

  return (
    <button
      type="button"
      onClick={() => void handleEnable()}
      className="self-start rounded-lg border border-app bg-surface px-3 py-1.5 text-xs font-semibold text-main hover:bg-[var(--surface-2)]"
    >
      Avisame cuando se libere un lugar
    </button>
  );
}
