"use client";

import { SocketEvents } from "@sala/contracts/events";
import type { RoomAdminPresentEvent, SeatFreedAlertEvent } from "@sala/contracts";
import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

/** How long the "seat(s) freed" toast stays up before self-clearing. */
const TOAST_AUTO_CLEAR_MS = 15_000;

export interface SeatFreedToast {
  seatIds: string[];
  freeCount: number;
}

/**
 * Realtime alerts for the room page: `seat:freed-alert` (private, opt-in) as a self-clearing
 * toast, and `room:admin-present` (room-wide, unconditional) as a dismissible banner. Both are
 * pure notifications — PostgreSQL/the room map itself is unaffected by either.
 */
export function useRoomAlerts(): {
  toast: SeatFreedToast | null;
  dismissToast: () => void;
  adminBanner: boolean;
  dismissAdminBanner: () => void;
} {
  const [toast, setToast] = useState<SeatFreedToast | null>(null);
  const [adminBanner, setAdminBanner] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    const onSeatFreed = (event: SeatFreedAlertEvent) => setToast({ seatIds: event.seatIds, freeCount: event.freeCount });
    const onAdminPresent = (_event: RoomAdminPresentEvent) => setAdminBanner(true);

    socket.on(SocketEvents.SeatFreedAlert, onSeatFreed);
    socket.on(SocketEvents.RoomAdminPresent, onAdminPresent);
    return () => {
      socket.off(SocketEvents.SeatFreedAlert, onSeatFreed);
      socket.off(SocketEvents.RoomAdminPresent, onAdminPresent);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_AUTO_CLEAR_MS);
    return () => clearTimeout(id);
  }, [toast]);

  return { toast, dismissToast: () => setToast(null), adminBanner, dismissAdminBanner: () => setAdminBanner(false) };
}
