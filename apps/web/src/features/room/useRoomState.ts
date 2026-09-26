"use client";

import { SocketEvents, type MeDto, type RoomMapDto, type SeatDto, type SeatStateChangedEvent } from "@uns/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";

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
 */
export function useRoomState(slug: string): RoomState {
  const [map, setMap] = useState<RoomMapDto | null>(null);
  const [me, setMe] = useState<MeDto | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const roomIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mapDto, meDto] = await Promise.all([
        apiFetch<RoomMapDto>(`/api/v1/rooms/${slug}/map`),
        apiFetch<MeDto>(`/api/v1/me`),
      ]);
      setMap(mapDto);
      setMe(meDto);
      roomIdRef.current = mapDto.room.id;
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

    const joinRoom = () => {
      setConnected(true);
      if (roomIdRef.current) {
        socket.emit(SocketEvents.RoomJoin, { roomId: roomIdRef.current });
      }
      void load();
    };

    const onConnect = () => joinRoom();
    const onDisconnect = () => setConnected(false);

    const onSeatStateChanged = (event: SeatStateChangedEvent) => {
      setMap((prev) => {
        if (!prev || event.roomId !== prev.room.id) return prev;
        const seats: SeatDto[] = prev.seats.map((seat) =>
          seat.id === event.seatId
            ? { ...seat, status: event.status, confidence: event.confidence, lastUpdatedAt: event.lastUpdatedAt }
            : seat,
        );
        return { ...prev, seats };
      });
    };

    const onSummaryChanged = (summary: RoomMapDto["summary"]) => {
      setMap((prev) => (prev && summary.roomId === prev.room.id ? { ...prev, summary } : prev));
    };

    const onDailyReset = () => void load();

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(SocketEvents.SeatStateChanged, onSeatStateChanged);
    socket.on(SocketEvents.RoomSummaryChanged, onSummaryChanged);
    socket.on(SocketEvents.RoomDailyReset, onDailyReset);

    if (socket.connected) joinRoom();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(SocketEvents.SeatStateChanged, onSeatStateChanged);
      socket.off(SocketEvents.RoomSummaryChanged, onSummaryChanged);
      socket.off(SocketEvents.RoomDailyReset, onDailyReset);
    };
  }, [load]);

  // Re-join the room if the map finishes loading after the socket already connected.
  useEffect(() => {
    if (map && connected) {
      getSocket().emit(SocketEvents.RoomJoin, { roomId: map.room.id });
    }
  }, [map?.room.id, connected]); // eslint-disable-line react-hooks/exhaustive-deps

  return { map, me, connected, loading, error, refetch: load };
}
