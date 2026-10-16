"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FAVORITE_SEATS_MAX } from "@sala/contracts";
import type { FavoriteSeatsDto } from "@sala/contracts";
import { apiFetch, apiPut, enc } from "@/features/pro/pro-api";
import { usePro } from "@/features/subscriptions/usePro";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { FREE_FAVORITES_MAX, favoriteToggleOutcome, shouldMigrate, toggleFavoriteIds } from "./favorite-seats";

const favoritesPath = (roomSlug: string) => `/api/v1/rooms/${enc(roomSlug)}/favorites`;
const getFavoriteSeats = (roomSlug: string) => apiFetch<FavoriteSeatsDto>(favoritesPath(roomSlug));
const putFavoriteSeats = (roomSlug: string, seatIds: string[]) => apiPut<FavoriteSeatsDto>(favoritesPath(roomSlug), { seatIds });

const keyFor = (roomSlug: string) => `sala-favorite-seat:${roomSlug}`;
const migratedKeyFor = (roomSlug: string) => `sala-favorite-migrated:${roomSlug}`;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Storage blocked (private mode): favorites just don't persist.
  }
}

export interface FavoriteSeats {
  favoriteSeatIds: string[];
  isFavorite: (seatId: string) => boolean;
  toggleFavorite: (seatId: string) => void;
  /** True when starring `seatId` would only open the Pro upsell (free slot taken by another seat). */
  needsPro: (seatId: string) => boolean;
  max: number;
  /** One-line feedback after a refused or failed toggle; clears itself. */
  notice: string | null;
}

/**
 * The viewer's favorite seats for a room. Free (or not yet known): one seat kept on this device.
 * Pro: up to 3, stored on the account (optimistic toggle, rolled back if the save fails).
 */
export function useFavoriteSeats(roomSlug: string): FavoriteSeats {
  const { lock } = usePro();
  const isPro = lock === "unlocked";
  const [localId, setLocalId] = useState<string | null>(null);
  const [serverIds, setServerIds] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const serverRef = useRef<string[] | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const applyServer = useCallback((ids: string[] | null) => {
    serverRef.current = ids;
    setServerIds(ids);
  }, []);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
  }, []);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydrate from localStorage
    setLocalId(readStorage(keyFor(roomSlug)));
  }, [roomSlug]);

  useEffect(() => {
    if (!isPro) return;
    let cancelled = false;
    void (async () => {
      try {
        const { seatIds } = await getFavoriteSeats(roomSlug);
        if (cancelled) return;
        const local = readStorage(keyFor(roomSlug));
        if (shouldMigrate(seatIds, local, readStorage(migratedKeyFor(roomSlug)))) {
          applyServer([local!]);
          try {
            await putFavoriteSeats(roomSlug, [local!]);
            writeStorage(migratedKeyFor(roomSlug), "1");
          } catch {
            if (!cancelled) applyServer(seatIds);
          }
          return;
        }
        applyServer(seatIds);
      } catch {
        // Offline or a stale Pro state: keep showing the device favorite.
        if (!cancelled) applyServer(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPro, roomSlug, applyServer]);

  // Losing Pro drops back to the device favorite without needing an effect to clear `serverIds`.
  const serverMode = isPro && serverIds !== null;
  const favoriteSeatIds = useMemo(() => (serverMode ? serverIds : localId ? [localId] : []), [serverMode, serverIds, localId]);
  const max = isPro ? FAVORITE_SEATS_MAX : FREE_FAVORITES_MAX;

  const toggleFavorite = useCallback(
    (seatId: string) => {
      const current = isPro ? serverRef.current : null;
      if (current === null) {
        const outcome = favoriteToggleOutcome(localId ? [localId] : [], seatId, lock !== "locked");
        if (outcome === "upsell") {
          openProUpsell("favorites");
          return;
        }
        const next = outcome === "remove" ? null : seatId;
        writeStorage(keyFor(roomSlug), next);
        setLocalId(next);
        return;
      }
      const { ids, full } = toggleFavoriteIds(current, seatId, FAVORITE_SEATS_MAX);
      if (full) {
        flash(`Máximo ${FAVORITE_SEATS_MAX} favoritos`);
        return;
      }
      applyServer(ids);
      putFavoriteSeats(roomSlug, ids).catch(() => {
        if (serverRef.current === ids) applyServer(current);
        flash("No se pudo guardar el favorito. Probá de nuevo.");
      });
    },
    [isPro, lock, localId, roomSlug, applyServer, flash],
  );

  const isFavorite = useCallback((seatId: string) => favoriteSeatIds.includes(seatId), [favoriteSeatIds]);

  const needsPro = useCallback(
    (seatId: string) => !serverMode && favoriteToggleOutcome(favoriteSeatIds, seatId, lock !== "locked") === "upsell",
    [serverMode, favoriteSeatIds, lock],
  );

  return { favoriteSeatIds, isFavorite, toggleFavorite, needsPro, max, notice };
}
