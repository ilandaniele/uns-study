"use client";

import { useCallback, useEffect, useState } from "react";

const keyFor = (roomSlug: string) => `sala-favorite-seat:${roomSlug}`;

/** The viewer's favorite seat for a room, kept on this device only (no account needed to read it). */
export function useFavoriteSeat(roomSlug: string) {
  const [favoriteSeatId, setFavoriteSeatId] = useState<string | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydrate from localStorage
      setFavoriteSeatId(window.localStorage.getItem(keyFor(roomSlug)));
    } catch {
      // Storage blocked (private mode): favorites just don't persist.
    }
  }, [roomSlug]);

  const toggleFavorite = useCallback(
    (seatId: string) => {
      setFavoriteSeatId((current) => {
        const next = current === seatId ? null : seatId;
        try {
          if (next) window.localStorage.setItem(keyFor(roomSlug), next);
          else window.localStorage.removeItem(keyFor(roomSlug));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [roomSlug],
  );

  return { favoriteSeatId, toggleFavorite };
}
