"use client";

import { useEffect, useState } from "react";
import { disputeCountdownLabel } from "./format";

export interface DisputeChallengeBannerProps {
  /** Human label for the disputed seat, e.g. "Mesa 4 · Asiento 3". */
  seatLabel: string;
  closesAt: string;
  pending: boolean;
  onStillHere: () => void;
  onLeft: () => void;
}

/**
 * Sticky "someone says you're not there" prompt for the incumbent of a check-in under dispute
 * (PRD dispute flow). Non-modal, same style as `ExtendBanner`.
 */
export function DisputeChallengeBanner({ seatLabel, closesAt, pending, onStillHere, onLeft }: DisputeChallengeBannerProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="font-medium">
        {/* Only the static sentence is announced; the per-second countdown must not re-trigger the live region. */}
        <span role="alert">Alguien dice que no estás en {seatLabel}. ¿Seguís ahí?</span>{" "}
        <span aria-live="off">Se decide en {disputeCountdownLabel(closesAt, now)}.</span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onStillHere}
          disabled={pending}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          Sigo acá
        </button>
        <button
          type="button"
          onClick={onLeft}
          disabled={pending}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          Me fui
        </button>
      </div>
    </div>
  );
}
