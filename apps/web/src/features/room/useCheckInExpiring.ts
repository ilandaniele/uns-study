"use client";

import { SocketEvents } from "@sala/contracts/events";
import type { CheckInExpiringEvent } from "@sala/contracts";
import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

/**
 * Latest `checkin:expiring` event (sent to the caller's personal socket room ~5 min before their
 * check-in expires). Vibrates the device once on arrival; compare with `isExpiringAlertFor`.
 */
export function useCheckInExpiring(): CheckInExpiringEvent | null {
  const [event, setEvent] = useState<CheckInExpiringEvent | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onExpiring = (payload: CheckInExpiringEvent) => {
      setEvent(payload);
      navigator.vibrate?.(200);
    };
    socket.on(SocketEvents.CheckInExpiring, onExpiring);
    return () => {
      socket.off(SocketEvents.CheckInExpiring, onExpiring);
    };
  }, []);

  return event;
}
