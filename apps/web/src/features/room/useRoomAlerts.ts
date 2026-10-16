"use client";

import { SocketEvents } from "@sala/contracts/events";
import type { QuietRoomAlertEvent, RoomAdminPresentEvent, SeatFreedAlertEvent } from "@sala/contracts";
import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

/** How long the "seat(s) freed" toast stays up before self-clearing. */
const TOAST_AUTO_CLEAR_MS = 15_000;

export interface SeatFreedToast {
  seatIds: string[];
  freeCount: number;
}

/**
 * Realtime alerts for the room page: `seat:freed-alert` and `room:quiet-alert` (private, opt-in)
 * as self-clearing toasts, and `room:admin-present` (room-wide, unconditional) as a dismissible
 * banner. All are pure notifications — the room's canonical state (Durable Object SQLite) is
 * unaffected by any of them.
 */
export function useRoomAlerts(): {
  toast: SeatFreedToast | null;
  dismissToast: () => void;
  adminBanner: boolean;
  dismissAdminBanner: () => void;
  quietAlert: QuietRoomAlertEvent | null;
  dismissQuietAlert: () => void;
} {
  const [toast, setToast] = useState<SeatFreedToast | null>(null);
  const [adminBanner, setAdminBanner] = useState(false);
  const [quietAlert, setQuietAlert] = useState<QuietRoomAlertEvent | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onSeatFreed = (event: SeatFreedAlertEvent) => setToast({ seatIds: event.seatIds, freeCount: event.freeCount });
    const onAdminPresent = (_event: RoomAdminPresentEvent) => setAdminBanner(true);
    const onQuiet = (event: QuietRoomAlertEvent) => setQuietAlert(event);

    socket.on(SocketEvents.SeatFreedAlert, onSeatFreed);
    socket.on(SocketEvents.RoomAdminPresent, onAdminPresent);
    socket.on(SocketEvents.QuietRoomAlert, onQuiet);
    return () => {
      socket.off(SocketEvents.SeatFreedAlert, onSeatFreed);
      socket.off(SocketEvents.RoomAdminPresent, onAdminPresent);
      socket.off(SocketEvents.QuietRoomAlert, onQuiet);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_AUTO_CLEAR_MS);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!quietAlert) return;
    const id = setTimeout(() => setQuietAlert(null), TOAST_AUTO_CLEAR_MS);
    return () => clearTimeout(id);
  }, [quietAlert]);

  return {
    toast,
    dismissToast: () => setToast(null),
    adminBanner,
    dismissAdminBanner: () => setAdminBanner(false),
    quietAlert,
    dismissQuietAlert: () => setQuietAlert(null),
  };
}
