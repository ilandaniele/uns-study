"use client";

import { SocketEvents } from "@uns/contracts/events";
import type { DisputeWonEvent } from "@uns/contracts";
import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

/** How long the "you won the vote" prompt stays up before self-clearing if the opener never acts. */
const AUTO_CLEAR_MS = 3 * 60_000;

export interface DisputeWon {
  disputeId: string;
  seatId: string;
  seatCode: string;
}

/**
 * Surfaces "you won the vote, the seat is free" for a CLAIM opener: live via `dispute:you-won`
 * (sent to the caller's personal socket room) once the incumbent's check-in is cancelled. Winning
 * a CLAIM no longer auto-seats the opener — they still have to self-check-in (fresh presence),
 * same as claiming any other free seat.
 */
export function useDisputeWon(): { won: DisputeWon | null; clear: () => void } {
  const [won, setWon] = useState<DisputeWon | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onWon = (event: DisputeWonEvent) => {
      setWon({ disputeId: event.disputeId, seatId: event.seatId, seatCode: event.seatCode });
    };
    socket.on(SocketEvents.DisputeYouWon, onWon);
    return () => {
      socket.off(SocketEvents.DisputeYouWon, onWon);
    };
  }, []);

  // Self-clears after a few minutes so a forgotten prompt doesn't sit there indefinitely.
  useEffect(() => {
    if (!won) return;
    const id = setTimeout(() => setWon(null), AUTO_CLEAR_MS);
    return () => clearTimeout(id);
  }, [won]);

  return { won, clear: () => setWon(null) };
}
