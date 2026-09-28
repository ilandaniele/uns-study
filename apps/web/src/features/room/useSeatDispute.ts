"use client";

import { SocketEvents, type SeatDisputeDto, type SeatDisputeLiteDto } from "@uns/contracts";
import { useCallback, useEffect, useState } from "react";
import { getDispute } from "@/lib/disputes";
import { getSocket } from "@/lib/socket";

export interface UseSeatDisputeResult {
  /** Viewer-specific detail (includes `myVote`/`iAmIncumbent`/`iAmOpener`) for the seat's open dispute, or null. */
  dispute: SeatDisputeDto | null;
  /** Applies a dispute DTO returned directly by an open/vote/respond call, without waiting for a refetch. */
  setDispute: (dispute: SeatDisputeDto | null) => void;
}

/**
 * Fetches `GET /disputes/:id` for a seat's currently open dispute (from `SeatDto.dispute`, kept in
 * sync by `useRoomState`) and refetches on the three dispute socket events so vote tallies and
 * `myVote` stay current for the viewer. `disputeRef` is `null` while the seat has no open dispute.
 */
export function useSeatDispute(seatId: string, disputeRef: { id: string; closesAt: string } | null): UseSeatDisputeResult {
  const [dispute, setDispute] = useState<SeatDisputeDto | null>(null);

  const refetch = useCallback(() => {
    if (!disputeRef) {
      setDispute(null);
      return;
    }
    getDispute(disputeRef.id)
      .then(setDispute)
      .catch(() => setDispute(null));
    // Intentionally keyed on the dispute id, not the whole (unstable) object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeRef?.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- (re)load whenever the seat's open dispute changes
    refetch();
  }, [refetch]);

  useEffect(() => {
    const socket = getSocket();
    const onOpened = (event: SeatDisputeLiteDto) => {
      if (event.seatId === seatId) refetch();
    };
    const onUpdated = (event: SeatDisputeLiteDto) => {
      if (event.id === disputeRef?.id) refetch();
    };
    const onResolved = (event: SeatDisputeLiteDto) => {
      if (event.id === disputeRef?.id) refetch();
    };

    socket.on(SocketEvents.SeatDisputeOpened, onOpened);
    socket.on(SocketEvents.SeatDisputeUpdated, onUpdated);
    socket.on(SocketEvents.SeatDisputeResolved, onResolved);

    return () => {
      socket.off(SocketEvents.SeatDisputeOpened, onOpened);
      socket.off(SocketEvents.SeatDisputeUpdated, onUpdated);
      socket.off(SocketEvents.SeatDisputeResolved, onResolved);
    };
  }, [seatId, disputeRef?.id, refetch]);

  return { dispute, setDispute };
}
