"use client";

import type { CheckInDto, DisputeKind, DisputeVote, RoomMapDto, SeatDisputeDto, SeatDto, SeatStateChangedEvent } from "@sala/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiFetch, apiPost, ApiRequestError } from "@/lib/api";
import { describeActionError } from "@/lib/errors";
import { getFreshLocation } from "@/lib/geolocation";
import { mutateMe, peekMe, refreshMe } from "@/lib/me-store";
import {
  applyDisputeOpened,
  applySeatEvent,
  applyOptimisticSeat,
  buildOptimisticCheckIn,
  extendCheckIn,
  rollbackOptimisticSeat,
  settleOptimisticSeat,
  type SeatPatch,
} from "./seat-merge";


/** A local, not-yet-confirmed change: `settle` on success, `rollback` on failure. */
interface Optimistic {
  settle: () => void;
  rollback: () => void;
}

/** What `useSeatActions` needs from the room page: local map updates and the targeted refreshes. */
export interface SeatActionsSync {
  updateMap: (updater: (prev: RoomMapDto | null) => RoomMapDto | null) => void;
  /** Full map + me re-sync; only used when an optimistic observation never got confirmed. */
  refetch: () => void;
  /** Occupants re-sync; only used when an action changes identity visibility. */
  refetchOccupants: () => void;
}

/** Extra, optional options threaded through presence-sensitive writes. `qrToken` is supplied by C3's QR flow; unset it's a no-op. */
export interface SeatActionOptions {
  qrToken?: string | null;
  /** Check-in only: how long the user will occupy the seat, in minutes (15..180). */
  durationMinutes?: number;
}

export interface UseSeatActionsResult {
  pending: boolean;
  /** True while `getFreshLocation()` is sampling GPS for the in-flight action, before the API call. */
  locating: boolean;
  actionError: string | null;
  /** True while the API is waiting for a Cloudflare Turnstile token to retry the last action. */
  turnstileRequired: boolean;
  clearError: () => void;
  checkIn: (seatId: string, showIdentity: boolean, options?: SeatActionOptions) => Promise<CheckInDto | null>;
  markFree: (seatId: string, options?: SeatActionOptions) => Promise<boolean>;
  markOccupied: (seatId: string, options?: SeatActionOptions) => Promise<boolean>;
  markSaved: (seatId: string, options?: SeatActionOptions) => Promise<boolean>;
  extend: (durationMinutes?: number) => Promise<boolean>;
  checkOut: () => Promise<boolean>;
  /** PATCH `/checkins/current/identity` — toggles "Mostrar mi identidad" on the caller's current check-in. */
  updateIdentity: (showIdentity: boolean) => Promise<CheckInDto | null>;
  /** Retries the last action (check-in/observation) with a solved Turnstile token. */
  submitTurnstileToken: (token: string) => void;
  /** POST `/disputes` — opens "Me senté acá" / "Esa persona no está" / "Está guardado" on a seat. */
  openDispute: (seatId: string, kind: DisputeKind) => Promise<SeatDisputeDto | null>;
  /** POST `/disputes/:id/votes` — casts the caller's PRESENT/ABSENT vote. */
  voteDispute: (disputeId: string, vote: DisputeVote) => Promise<SeatDisputeDto | null>;
  /** POST `/disputes/:id/respond` — the challenged incumbent answers "Sigo acá" or "Me fui". */
  respondDispute: (disputeId: string, action: "STILL_HERE" | "LEFT") => Promise<SeatDisputeDto | null>;
}

function isCheckInDto(value: unknown): value is CheckInDto {
  return typeof value === "object" && value !== null && "expiresAt" in value && "seatId" in value;
}

function sameCheckIn(a: CheckInDto | null, b: CheckInDto | null): boolean {
  return a === b || (a != null && b != null && a.id === b.id && a.expiresAt === b.expiresAt && a.showIdentity === b.showIdentity);
}

/**
 * Encapsulates the presence-sensitive write actions (check-in, observation, extend, checkout).
 *
 * Check-in/move, checkout, extend, identity and observations are optimistic: the map and the shared
 * `/me` update as soon as the location is known, then the POST response (or the socket event that
 * follows it) confirms. A failure rolls the optimistic change back, unless a newer event already
 * replaced it. No action refetches the map/me blindly.
 */
export function useSeatActions(map: RoomMapDto | null, sync: SeatActionsSync): UseSeatActionsResult {
  const { updateMap, refetch, refetchOccupants } = sync;
  const [pending, setPending] = useState(false);
  const [locating, setLocating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [turnstileRequired, setTurnstileRequired] = useState(false);
  const retryRef = useRef<((token: string) => void) | null>(null);
  // Latest map, so optimistic patches capture the seat as the user sees it right now.
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  }, [map]);
  // Holds the latest `run` so the TURNSTILE_REQUIRED branch below can retry without
  // capturing `run` itself (which isn't declared yet at that point in the closure).
  const runRef = useRef<(<T>(factory: (turnstileToken?: string) => Promise<T>, turnstileToken?: string) => Promise<T | null>) | null>(
    null,
  );

  const clearError = useCallback(() => {
    setActionError(null);
    setTurnstileRequired(false);
    retryRef.current = null;
  }, []);

  const run = useCallback(
    async <T,>(factory: (turnstileToken?: string) => Promise<T>, turnstileToken?: string): Promise<T | null> => {
      setPending(true);
      setActionError(null);
      try {
        const result = await factory(turnstileToken);
        setTurnstileRequired(false);
        retryRef.current = null;
        return result;
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "TURNSTILE_REQUIRED") {
          setTurnstileRequired(true);
          retryRef.current = (token: string) => void runRef.current?.(factory, token);
        } else {
          setTurnstileRequired(false);
          retryRef.current = null;
          setActionError(describeActionError(error));
        }
        return null;
      } finally {
        setPending(false);
      }
    },
    [],
  );
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  /** Wraps `getFreshLocation()` so `locating` is true only while GPS sampling is in flight. */
  const locate = useCallback(async () => {
    setLocating(true);
    try {
      return await getFreshLocation();
    } finally {
      setLocating(false);
    }
  }, []);

  /** Shows the given seat statuses immediately; the returned handle settles or undoes exactly those changes. */
  const optimisticSeats = useCallback(
    (changes: [seatId: string, status: SeatDto["status"], occupiedUntil?: string | null][]): Optimistic & { patches: (SeatPatch | null)[] } => {
      const patches = changes.map(([seatId, status, until]) => applyOptimisticSeat(mapRef.current, seatId, status, until).patch);
      updateMap((prev) => changes.reduce((acc, [seatId, status, until]) => applyOptimisticSeat(acc, seatId, status, until).map, prev));
      return {
        patches,
        settle: () => updateMap((prev) => patches.reduce((acc, patch) => settleOptimisticSeat(acc, patch), prev)),
        rollback: () => updateMap((prev) => patches.reduce((acc, patch) => rollbackOptimisticSeat(acc, patch), prev)),
      };
    },
    [updateMap],
  );

  /** Shows `next` as the caller's active check-in immediately; rollback only if nothing replaced it meanwhile. */
  const optimisticMe = useCallback((next: CheckInDto | null): Optimistic => {
    const previous = peekMe()?.activeCheckIn ?? null;
    mutateMe((me) => ({ ...me, activeCheckIn: next }));
    return {
      settle: () => undefined,
      rollback: () => mutateMe((me) => (sameCheckIn(me.activeCheckIn, next) ? { ...me, activeCheckIn: previous } : me)),
    };
  }, []);

  /** Awaits `request`; success settles the optimistic changes, failure undoes them and rethrows. */
  const withOptimistic = useCallback(async <T,>(changes: Optimistic[], request: () => Promise<T>): Promise<T> => {
    try {
      const result = await request();
      for (const change of changes) change.settle();
      return result;
    } catch (error) {
      for (const change of changes) change.rollback();
      throw error;
    }
  }, []);

  /** The POST response is the canonical check-in: put it in the shared `/me` store. */
  const adoptCheckIn = useCallback((dto: unknown) => {
    if (isCheckInDto(dto)) mutateMe((me) => ({ ...me, activeCheckIn: dto }));
  }, []);

  const checkIn = useCallback(
    (seatId: string, showIdentity: boolean, options?: SeatActionOptions) =>
      run(async (turnstileToken) => {
        const location = await locate();
        const target = mapRef.current?.seats.find((seat) => seat.id === seatId);
        const current = peekMe()?.activeCheckIn ?? null;
        const changes: Optimistic[] = [];
        if (target && map) {
          const optimisticCheckIn = buildOptimisticCheckIn(target, map.room.id, showIdentity, Date.now(), options?.durationMinutes);
          const seatChanges: [string, SeatDto["status"], string?][] = [[seatId, "OCCUPIED", optimisticCheckIn.expiresAt]];
          // Moving: the API frees the old seat in the same transaction.
          if (current && current.seatId !== seatId) seatChanges.push([current.seatId, "FREE"]);
          changes.push(optimisticSeats(seatChanges), optimisticMe(optimisticCheckIn));
        }
        const dto = await withOptimistic(changes, () =>
          apiPost<CheckInDto>("/api/v1/checkins", {
            roomId: map?.room.id,
            seatId,
            location,
            showIdentity,
            durationMinutes: options?.durationMinutes,
            qrToken: options?.qrToken ?? undefined,
            turnstileToken,
          }),
        );
        adoptCheckIn(dto);
        // Identity visibility is the one thing the occupants list can't learn from the seat event alone.
        if (showIdentity) refetchOccupants();
        return dto;
      }),
    [adoptCheckIn, locate, map, optimisticMe, optimisticSeats, refetchOccupants, run, withOptimistic],
  );

  const observe = useCallback(
    (seatId: string, status: "FREE" | "OCCUPIED" | "SAVED", options?: SeatActionOptions) =>
      run(async (turnstileToken) => {
        const location = await locate();
        const seat = optimisticSeats([[seatId, status]]);
        const result = await withOptimistic([seat], () =>
          apiPost<{ ok: true; seats?: SeatStateChangedEvent[] }>("/api/v1/observations", {
            roomId: map?.room.id,
            seatId,
            status,
            location,
            qrToken: options?.qrToken ?? undefined,
            turnstileToken,
          }),
        );
        const confirmed = result?.seats ?? [];
        if (confirmed.length > 0) {
          // Server-confirmed state with its real timestamp (replaces the optimistic seat at once).
          updateMap((prev) => confirmed.reduce((acc, event) => applySeatEvent(acc, event), prev));
        }
        if (!confirmed.some((event) => event.seatId === seatId)) {
          // The server left this seat unchanged (e.g. a check-in outranks the observation):
          // re-sync so the optimistic state doesn't linger.
          refetch();
        }
        return true;
      }).then((v) => v ?? false),
    [locate, map?.room.id, optimisticSeats, refetch, run, updateMap, withOptimistic],
  );

  const markFree = useCallback((seatId: string, options?: SeatActionOptions) => observe(seatId, "FREE", options), [observe]);
  const markOccupied = useCallback((seatId: string, options?: SeatActionOptions) => observe(seatId, "OCCUPIED", options), [observe]);
  const markSaved = useCallback((seatId: string, options?: SeatActionOptions) => observe(seatId, "SAVED", options), [observe]);

  const extend = useCallback(
    (durationMinutes?: number) =>
      run(async () => {
        const location = await locate();
        const current = peekMe()?.activeCheckIn ?? null;
        const changes = current ? [optimisticMe(extendCheckIn(current, Date.now(), durationMinutes))] : [];
        const dto = await withOptimistic(changes, () =>
          apiPost<CheckInDto>("/api/v1/checkins/current/extend", { location, durationMinutes }),
        );
        adoptCheckIn(dto);
        return true;
      }).then((v) => v ?? false),
    [adoptCheckIn, locate, optimisticMe, run, withOptimistic],
  );

  const checkOut = useCallback(
    () =>
      run(async () => {
        const current = peekMe()?.activeCheckIn ?? null;
        const changes: Optimistic[] = current ? [optimisticSeats([[current.seatId, "FREE"]]), optimisticMe(null)] : [];
        await withOptimistic(changes, () => apiDelete("/api/v1/checkins/current"));
        return true;
      }).then((v) => v ?? false),
    [optimisticMe, optimisticSeats, run, withOptimistic],
  );

  const updateIdentity = useCallback(
    (showIdentity: boolean) =>
      run(async () => {
        const current = peekMe()?.activeCheckIn ?? null;
        const changes = current ? [optimisticMe({ ...current, showIdentity })] : [];
        const dto = await withOptimistic(changes, () =>
          apiFetch<CheckInDto>("/api/v1/checkins/current/identity", { method: "PATCH", body: JSON.stringify({ showIdentity }) }),
        );
        adoptCheckIn(dto);
        return dto;
      }),
    [adoptCheckIn, optimisticMe, run, withOptimistic],
  );

  const submitTurnstileToken = useCallback((token: string) => {
    retryRef.current?.(token);
  }, []);

  const openDispute = useCallback(
    (seatId: string, kind: DisputeKind) =>
      run(async () => {
        const location = await locate();
        const dispute = await apiPost<SeatDisputeDto>("/api/v1/disputes", { roomId: map?.room.id, seatId, kind, location });
        updateMap((prev) => applyDisputeOpened(prev, dispute));
        return dispute;
      }),
    [locate, map?.room.id, run, updateMap],
  );

  const voteDispute = useCallback(
    (disputeId: string, vote: DisputeVote) =>
      run(async () => {
        const location = await locate();
        return apiPost<SeatDisputeDto>(`/api/v1/disputes/${disputeId}/votes`, { vote, location });
      }),
    [locate, run],
  );

  const respondDispute = useCallback(
    (disputeId: string, action: "STILL_HERE" | "LEFT") =>
      run(async () => {
        const location = action === "STILL_HERE" ? await locate() : undefined;
        const dispute = await apiPost<SeatDisputeDto>(`/api/v1/disputes/${disputeId}/respond`, { action, location });
        // "Me fui" ends my check-in server-side; the seat/dispute socket events cover the map.
        if (action === "LEFT") void refreshMe().catch(() => undefined);
        return dispute;
      }),
    [locate, run],
  );

  return {
    pending,
    locating,
    actionError,
    turnstileRequired,
    clearError,
    checkIn,
    markFree,
    markOccupied,
    markSaved,
    extend,
    checkOut,
    updateIdentity,
    submitTurnstileToken,
    openDispute,
    voteDispute,
    respondDispute,
  };
}
