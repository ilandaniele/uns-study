"use client";

import { SocketEvents } from "@uns/contracts/events";
import type { DisputeChallengedEvent, MeDto, RoomMapDto, SeatDisputeLiteDto } from "@uns/contracts";
import { useEffect, useState } from "react";
import { getDispute } from "@/lib/disputes";
import { getSocket } from "@/lib/socket";
import { msUntilDisputeAutoClear } from "./format";

export interface IncumbentChallenge {
  disputeId: string;
  seatId: string;
  seatCode: string;
  closesAt: string;
}

/**
 * Surfaces "someone says you're not there" challenges for the caller's own active check-in:
 * live via `dispute:you-are-challenged` (sent to the caller's personal socket room), and on
 * load/reconnect by checking whether the seat of the caller's active check-in already has an
 * open dispute naming them as incumbent (e.g. the challenge fired while they were offline).
 */
export function useIncumbentChallenge(map: RoomMapDto | null, me: MeDto | null): { challenge: IncumbentChallenge | null; clear: () => void } {
  const [challenge, setChallenge] = useState<IncumbentChallenge | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onChallenged = (event: DisputeChallengedEvent) => {
      // A physical nudge for a time-sensitive prompt — easy to miss if the phone is face-down.
      navigator.vibrate?.(200);
      setChallenge({ disputeId: event.disputeId, seatId: event.seatId, seatCode: event.seatCode, closesAt: event.closesAt });
    };
    const onResolved = (event: SeatDisputeLiteDto) => {
      setChallenge((prev) => (prev && prev.disputeId === event.id ? null : prev));
    };

    socket.on(SocketEvents.DisputeYouAreChallenged, onChallenged);
    socket.on(SocketEvents.SeatDisputeResolved, onResolved);

    return () => {
      socket.off(SocketEvents.DisputeYouAreChallenged, onChallenged);
      socket.off(SocketEvents.SeatDisputeResolved, onResolved);
    };
  }, []);

  const activeSeatId = me?.activeCheckIn?.seatId ?? null;
  const activeSeatDisputeId = (activeSeatId && map?.seats.find((seat) => seat.id === activeSeatId)?.dispute?.id) ?? null;
  const activeSeatCode = (activeSeatId && map?.seats.find((seat) => seat.id === activeSeatId)?.code) ?? null;

  useEffect(() => {
    if (!activeSeatId || !activeSeatDisputeId || !activeSeatCode) return;
    let cancelled = false;
    getDispute(activeSeatDisputeId)
      .then((dto) => {
        if (!cancelled && dto.status === "OPEN" && dto.iAmIncumbent) {
          setChallenge({ disputeId: dto.id, seatId: activeSeatId, seatCode: activeSeatCode, closesAt: dto.closesAt });
        }
      })
      .catch(() => {
        // Best-effort — the live `dispute:you-are-challenged` event still covers this case.
      });
    return () => {
      cancelled = true;
    };
  }, [activeSeatId, activeSeatDisputeId, activeSeatCode]);

  // Self-clears shortly after `closesAt` even if the resolution socket event/refetch never lands
  // (e.g. a dropped connection), so the banner can't outlive the vote it's about.
  useEffect(() => {
    if (!challenge) return;
    const id = setTimeout(() => setChallenge(null), msUntilDisputeAutoClear(challenge.closesAt));
    return () => clearTimeout(id);
  }, [challenge]);

  return { challenge, clear: () => setChallenge(null) };
}
