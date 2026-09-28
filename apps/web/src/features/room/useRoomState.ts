"use client";

import {
  SocketEvents,
  type MeDto,
  type RoomMapDto,
  type SeatDisputeLiteDto,
  type SeatStateChangedEvent,
  type TableNicknameChangedEvent,
} from "@uns/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { applyDisputeOpened, applyDisputeResolved, applySeatEvent, applyTableNicknameChanged, mergeSnapshot } from "./seat-merge";

export interface RoomState {
  map: RoomMapDto | null;
  me: MeDto | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Loads the room map + current user, then keeps seat/summary state in sync via Socket.IO.
 * `MY_SEAT` is derived client-side: the seat of the caller's own active check-in.
 *
 * Ordering: the room channel is joined first and the map is re-fetched only after the server
 * acknowledges the join, so no `seat:state-changed` can fall in the gap between the snapshot and
 * the subscription. Snapshots and events are merged by `lastUpdatedAt` (see `seat-merge.ts`) so
 * whichever arrives last cannot roll a seat back to an older state.
 */
export function useRoomState(slug: string): RoomState {
  const [map, setMap] = useState<RoomMapDto | null>(null);
  const [me, setMe] = useState<MeDto | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Latest `me`, readable from socket handlers below without re-subscribing on every fetch.
  const meRef = useRef<MeDto | null>(null);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  const load = useCallback(async () => {
    try {
      const [mapDto, meDto] = await Promise.all([
        apiFetch<RoomMapDto>(`/api/v1/rooms/${slug}/map`),
        apiFetch<MeDto>(`/api/v1/me`),
      ]);
      setMap((prev) => mergeSnapshot(prev, mapDto));
      setMe(meDto);
      setError(null);
    } catch {
      setError("No pudimos cargar el mapa de la sala.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount/slug change
    void load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onSeatStateChanged = (event: SeatStateChangedEvent) => {
      setMap((prev) => applySeatEvent(prev, event));
      // The change is on the caller's own active check-in seat (e.g. it was cancelled by a
      // resolved dispute) — refetch /me so a ghost MyCheckInBar/MY_SEAT highlight doesn't linger.
      if (meRef.current?.activeCheckIn?.seatId === event.seatId) void load();
    };

    const onSummaryChanged = (summary: RoomMapDto["summary"]) => {
      setMap((prev) => (prev && summary.roomId === prev.room.id ? { ...prev, summary } : prev));
    };

    const onDailyReset = () => void load();

    const onDisputeOpened = (event: SeatDisputeLiteDto) => setMap((prev) => applyDisputeOpened(prev, event));
    const onDisputeResolved = (event: SeatDisputeLiteDto) => {
      setMap((prev) => applyDisputeResolved(prev, event));
      // A resolved dispute can cancel the incumbent's check-in server-side; refetch /me so a
      // ghost MyCheckInBar/MY_SEAT highlight doesn't linger for whoever lost it.
      void load();
    };
    const onTableNicknameChanged = (event: TableNicknameChangedEvent) => setMap((prev) => applyTableNicknameChanged(prev, event));

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(SocketEvents.SeatStateChanged, onSeatStateChanged);
    socket.on(SocketEvents.RoomSummaryChanged, onSummaryChanged);
    socket.on(SocketEvents.RoomDailyReset, onDailyReset);
    socket.on(SocketEvents.SeatDisputeOpened, onDisputeOpened);
    socket.on(SocketEvents.SeatDisputeResolved, onDisputeResolved);
    socket.on(SocketEvents.TableNicknameChanged, onTableNicknameChanged);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with a socket that connected before mount
    if (socket.connected) setConnected(true);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(SocketEvents.SeatStateChanged, onSeatStateChanged);
      socket.off(SocketEvents.RoomSummaryChanged, onSummaryChanged);
      socket.off(SocketEvents.RoomDailyReset, onDailyReset);
      socket.off(SocketEvents.SeatDisputeOpened, onDisputeOpened);
      socket.off(SocketEvents.SeatDisputeResolved, onDisputeResolved);
      socket.off(SocketEvents.TableNicknameChanged, onTableNicknameChanged);
    };
  }, [load]);

  // (Re-)join the room channel whenever the room is known and the socket is (re)connected, then
  // re-sync from REST once the server confirms the subscription.
  const roomId = map?.room.id;
  useEffect(() => {
    if (!roomId || !connected) return;
    getSocket().emit(SocketEvents.RoomJoin, { roomId }, () => void load());
  }, [roomId, connected, load]);

  return { map, me, connected, loading, error, refetch: load };
}
