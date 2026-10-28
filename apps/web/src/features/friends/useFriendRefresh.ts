"use client";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

export function notifyFriendsChanged() { window.dispatchEvent(new Event("sala:friends-changed")); }

/** Private events invalidate views; the API remains canonical. Focus/poll cover reconnects. */
export function useFriendRefresh(refresh: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const socket = getSocket();
    socket.on("friends:changed", visible).on("connect", visible);
    window.addEventListener("sala:friends-changed", visible);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 60_000);
    return () => {
      socket.off("friends:changed", visible).off("connect", visible);
      window.removeEventListener("sala:friends-changed", visible);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      window.clearInterval(timer);
    };
  }, [refresh, enabled]);
}
