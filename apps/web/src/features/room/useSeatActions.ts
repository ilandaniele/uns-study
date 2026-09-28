"use client";

import type { CheckInDto, DisputeKind, DisputeVote, RoomMapDto, SeatDisputeDto } from "@uns/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiFetch, apiPost, ApiRequestError } from "@/lib/api";
import { describeActionError } from "@/lib/errors";
import { getFreshLocation } from "@/lib/geolocation";

/** Extra, optional options threaded through presence-sensitive writes. `qrToken` is supplied by C3's QR flow; unset it's a no-op. */
export interface SeatActionOptions {
  qrToken?: string | null;
}

export interface UseSeatActionsResult {
  pending: boolean;
  actionError: string | null;
  /** True while the API is waiting for a Cloudflare Turnstile token to retry the last action. */
  turnstileRequired: boolean;
  clearError: () => void;
  checkIn: (seatId: string, showIdentity: boolean, options?: SeatActionOptions) => Promise<CheckInDto | null>;
  markFree: (seatId: string, options?: SeatActionOptions) => Promise<boolean>;
  markOccupied: (seatId: string, options?: SeatActionOptions) => Promise<boolean>;
  extend: () => Promise<boolean>;
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

/** Encapsulates the presence-sensitive write actions (check-in, observation, extend, checkout). */
export function useSeatActions(map: RoomMapDto | null, onChanged: () => void): UseSeatActionsResult {
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [turnstileRequired, setTurnstileRequired] = useState(false);
  const retryRef = useRef<((token: string) => void) | null>(null);
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
        onChanged();
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
    [onChanged],
  );
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const checkIn = useCallback(
    (seatId: string, showIdentity: boolean, options?: SeatActionOptions) =>
      run(async (turnstileToken) => {
        const location = await getFreshLocation();
        return apiPost<CheckInDto>("/api/v1/checkins", {
          roomId: map?.room.id,
          seatId,
          location,
          showIdentity,
          qrToken: options?.qrToken ?? undefined,
          turnstileToken,
        });
      }),
    [map?.room.id, run],
  );

  const markFree = useCallback(
    (seatId: string, options?: SeatActionOptions) =>
      run(async (turnstileToken) => {
        const location = await getFreshLocation();
        await apiPost("/api/v1/observations", {
          roomId: map?.room.id,
          seatId,
          status: "FREE",
          location,
          qrToken: options?.qrToken ?? undefined,
          turnstileToken,
        });
        return true;
      }).then((v) => v ?? false),
    [map?.room.id, run],
  );

  const markOccupied = useCallback(
    (seatId: string, options?: SeatActionOptions) =>
      run(async (turnstileToken) => {
        const location = await getFreshLocation();
        await apiPost("/api/v1/observations", {
          roomId: map?.room.id,
          seatId,
          status: "OCCUPIED",
          location,
          qrToken: options?.qrToken ?? undefined,
          turnstileToken,
        });
        return true;
      }).then((v) => v ?? false),
    [map?.room.id, run],
  );

  const extend = useCallback(
    () =>
      run(async () => {
        const location = await getFreshLocation();
        await apiPost("/api/v1/checkins/current/extend", { location });
        return true;
      }).then((v) => v ?? false),
    [run],
  );

  const checkOut = useCallback(
    () =>
      run(async () => {
        await apiDelete("/api/v1/checkins/current");
        return true;
      }).then((v) => v ?? false),
    [run],
  );

  const updateIdentity = useCallback(
    (showIdentity: boolean) =>
      run(() => apiFetch<CheckInDto>("/api/v1/checkins/current/identity", { method: "PATCH", body: JSON.stringify({ showIdentity }) })),
    [run],
  );

  const submitTurnstileToken = useCallback((token: string) => {
    retryRef.current?.(token);
  }, []);

  const openDispute = useCallback(
    (seatId: string, kind: DisputeKind) =>
      run(async () => {
        const location = await getFreshLocation();
        return apiPost<SeatDisputeDto>("/api/v1/disputes", { roomId: map?.room.id, seatId, kind, location });
      }),
    [map?.room.id, run],
  );

  const voteDispute = useCallback(
    (disputeId: string, vote: DisputeVote) =>
      run(async () => {
        const location = await getFreshLocation();
        return apiPost<SeatDisputeDto>(`/api/v1/disputes/${disputeId}/votes`, { vote, location });
      }),
    [run],
  );

  const respondDispute = useCallback(
    (disputeId: string, action: "STILL_HERE" | "LEFT") =>
      run(async () => {
        const location = action === "STILL_HERE" ? await getFreshLocation() : undefined;
        return apiPost<SeatDisputeDto>(`/api/v1/disputes/${disputeId}/respond`, { action, location });
      }),
    [run],
  );

  return {
    pending,
    actionError,
    turnstileRequired,
    clearError,
    checkIn,
    markFree,
    markOccupied,
    extend,
    checkOut,
    updateIdentity,
    submitTurnstileToken,
    openDispute,
    voteDispute,
    respondDispute,
  };
}
