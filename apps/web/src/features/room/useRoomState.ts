"use client";

import {
  SocketEvents,
  type MeDto,
  type RoomMapDto,
  type SeatDisputeLiteDto,
  type SeatStateChangedEvent,
  type TableNicknameChangedEvent,
} from "@sala/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { refreshMe, useMe } from "@/lib/me-store";
import { getSocket } from "@/lib/socket";
import { applyDisputeOpened, applyDisputeResolved, applySeatEvent, applyTableNicknameChanged, mergeSnapshot } from "./seat-merge";

export interface RoomState {
  map: RoomMapDto | null;
  me: MeDto | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Functional update of the map, for optimistic changes from `useSeatActions`. */
  updateMap: (updater: (prev: RoomMapDto | null) => RoomMapDto | null) => void;
}

/** Error shown (and not retried) when the room slug doesn't exist. */
export const ROOM_NOT_FOUND = "No encontramos esa sala.";

/** Last map per slug, so revisiting the room paints immediately while it revalidates. */
const lastSnapshots = new Map<string, RoomMapDto>();

/**
 * Loads the room map + current user, then keeps seat/summary state in sync via Socket.IO.
 * `MY_SEAT` is derived client-side: the seat of the caller's own active check-in.
 *
 * Ordering: the room channel is joined first and the map is re-fetched only after the server
 * acknowledges the join, so no `seat:state-changed` can fall in the gap between the snapshot and
 * the subscription. Snapshots and events are merged by `lastUpdatedAt` (see `seat-merge.ts`) so
 * whichever arrives last cannot roll a seat back to an older state. A map request that started
 * after the join was emitted already satisfies that guarantee, so the join ack skips its refetch.
 *
 * `me` comes from the shared store (`@/lib/me-store`), so it is fetched once for the whole app.
 * The last map per slug is kept at module level so returning to the room renders instantly while
 * it revalidates.
 */
export function useRoomState(slug: string): RoomState {
  const [map, setMap] = useState<RoomMapDto | null>(() => lastSnapshots.get(slug) ?? null);
  const { me, loading: meLoading } = useMe();
  const [connected, setConnected] = useState(false);
  const [mapLoading, setMapLoading] = useState(() => !lastSnapshots.has(slug));
  const [error, setError] = useState<string | null>(null);

  // Latest `me`, readable from socket handlers below without re-subscribing on every fetch.
  const meRef = useRef<MeDto | null>(null);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    if (map && map.room.slug === slug) lastSnapshots.set(slug, map);
  }, [map, slug]);

  // Monotonic clock for the join-then-snapshot guard: map requests and join emits share it.
  const seqRef = useRef(0);
  const lastMapStartRef = useRef(0);

  const loadMap = useCallback(async () => {
    lastMapStartRef.current = ++seqRef.current;
    try {
      const mapDto = await apiFetch<RoomMapDto>(`/api/v1/rooms/${slug}/map`);
      setMap((prev) => mergeSnapshot(prev, mapDto));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError && err.status === 404 ? ROOM_NOT_FOUND : "No pudimos cargar el mapa de la sala.");
    } finally {
      setMapLoading(false);
    }
  }, [slug]);

  const load = useCallback(() => {
    void refreshMe().catch(() => undefined);
    return loadMap();
  }, [loadMap]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount/slug change
    void loadMap();
  }, [loadMap]);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onSeatStateChanged = (event: SeatStateChangedEvent) => {
      setMap((prev) => applySeatEvent(prev, event));
      // The caller's own seat stopped being OCCUPIED (e.g. its check-in was cancelled by a resolved
      // dispute) — refresh /me so a ghost MyCheckInBar/MY_SEAT highlight doesn't linger. OCCUPIED
      // is what our own check-in/extend produces, and those already updated /me from the response.
      if (event.status !== "OCCUPIED" && meRef.current?.activeCheckIn?.seatId === event.seatId) void refreshMe().catch(() => undefined);
    };

    const onSummaryChanged = (summary: RoomMapDto["summary"]) => {
      setMap((prev) => (prev && summary.roomId === prev.room.id ? { ...prev, summary } : prev));
    };

    const onDailyReset = () => void load();

    const onDisputeOpened = (event: SeatDisputeLiteDto) => setMap((prev) => applyDisputeOpened(prev, event));
    const onDisputeResolved = (event: SeatDisputeLiteDto) => {
      setMap((prev) => applyDisputeResolved(prev, event));
      // A resolved dispute can cancel the incumbent's check-in server-side; refresh /me (only if
      // it's about my seat) so a ghost MyCheckInBar/MY_SEAT highlight doesn't linger.
      if (meRef.current?.activeCheckIn?.seatId === event.seatId) void refreshMe().catch(() => undefined);
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
  // re-sync the map from REST once the server confirms the subscription (unless a map request that
  // started after the join was emitted is already covering that gap).
  const roomId = map?.room.id;
  useEffect(() => {
    if (!roomId || !connected) return;
    const joinSeq = ++seqRef.current;
    getSocket().emit(SocketEvents.RoomJoin, { roomId }, () => {
      if (lastMapStartRef.current > joinSeq) return;
      void loadMap();
    });
  }, [roomId, connected, loadMap]);

  return { map, me, connected, loading: mapLoading || meLoading, error, refetch: load, updateMap: setMap };
}
