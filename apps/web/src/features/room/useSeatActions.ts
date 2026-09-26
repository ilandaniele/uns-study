"use client";

import type { CheckInDto, RoomMapDto } from "@uns/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiPost, ApiRequestError } from "@/lib/api";
import { describeActionError } from "@/lib/errors";
import { getFreshLocation } from "@/lib/geolocation";

export interface UseSeatActionsResult {
  pending: boolean;
  actionError: string | null;
  /** True while the API is waiting for a Cloudflare Turnstile token to retry the last action. */
  turnstileRequired: boolean;
  clearError: () => void;
  checkIn: (seatId: string, showIdentity: boolean) => Promise<CheckInDto | null>;
  markFree: (seatId: string) => Promise<boolean>;
  markOccupied: (seatId: string) => Promise<boolean>;
  extend: () => Promise<boolean>;
  checkOut: () => Promise<boolean>;
  /** Retries the last action (check-in/observation) with a solved Turnstile token. */
  submitTurnstileToken: (token: string) => void;
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
    (seatId: string, showIdentity: boolean) =>
      run(async (turnstileToken) => {
        const location = await getFreshLocation();
        return apiPost<CheckInDto>("/api/v1/checkins", { roomId: map?.room.id, seatId, location, showIdentity, turnstileToken });
      }),
    [map?.room.id, run],
  );

  const markFree = useCallback(
    (seatId: string) =>
      run(async (turnstileToken) => {
        const location = await getFreshLocation();
        await apiPost("/api/v1/observations", { roomId: map?.room.id, seatId, status: "FREE", location, turnstileToken });
        return true;
      }).then((v) => v ?? false),
    [map?.room.id, run],
  );

  const markOccupied = useCallback(
    (seatId: string) =>
      run(async (turnstileToken) => {
        const location = await getFreshLocation();
        await apiPost("/api/v1/observations", { roomId: map?.room.id, seatId, status: "OCCUPIED", location, turnstileToken });
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

  const submitTurnstileToken = useCallback((token: string) => {
    retryRef.current?.(token);
  }, []);

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
    submitTurnstileToken,
  };
}
