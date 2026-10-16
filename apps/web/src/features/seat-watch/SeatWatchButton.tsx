"use client";

import { useCallback, useEffect, useState } from "react";
import type { SeatDto, SeatWatchResponse } from "@sala/contracts";
import { BellRingingIcon } from "@phosphor-icons/react/dist/ssr";
import { clockLabel } from "@/features/room/checkin-duration";
import { apiDelete, apiFetch, apiPut, enc, isProRequired } from "@/features/pro/pro-api";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { ProBadge, proLabel } from "@/features/subscriptions/ProBadge";
import { usePro } from "@/features/subscriptions/usePro";
import { useMe } from "@/lib/me-store";
import { enablePushNotificationsDetailed, getPushSupportState, pushFailureMessage } from "@/lib/push";
import { isWatchingMode, watchSeatIdsFor, type SeatWatchMode } from "./seat-watch";

export interface SeatWatchButtonProps {
  roomSlug: string;
  seat: SeatDto;
  tableSeats: SeatDto[];
  checkedInHere: boolean;
}

/** True when this browser already has a push subscription registered with the service worker. */
async function hasPushSubscription(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    return (await registration?.pushManager.getSubscription()) != null;
  } catch {
    return false;
  }
}

const actionClass =
  "min-h-11 rounded-control border border-app bg-surface px-3.5 py-2 text-left text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50";

/** Pro: "Avisame cuando se libere" on an occupied seat. Only notifies; never holds the seat. */
export function SeatWatchButton({ roomSlug, seat, tableSeats, checkedInHere }: SeatWatchButtonProps) {
  const { me } = useMe();
  const { lock } = usePro();
  const signedIn = me?.user != null;
  const [watch, setWatch] = useState<SeatWatchResponse["watch"]>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = `/api/v1/rooms/${enc(roomSlug)}/seat-watch`;

  useEffect(() => {
    if (lock !== "unlocked" || !signedIn) return;
    let cancelled = false;
    apiFetch<SeatWatchResponse>(path)
      .then((res) => {
        if (!cancelled) setWatch(res.watch);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lock, signedIn, path]);

  const start = useCallback(
    async (mode: SeatWatchMode) => {
      setError(null);
      setPending(true);
      try {
        // Push first, while the tap's user activation still allows the permission prompt.
        if (getPushSupportState() !== "available" || !(await hasPushSubscription())) {
          const pushed = await enablePushNotificationsDetailed();
          if (!pushed.ok) {
            setError(pushFailureMessage(pushed));
            return;
          }
        }
        const res = await apiPut<SeatWatchResponse>(path, { seatIds: watchSeatIdsFor(mode, seat, tableSeats) });
        setWatch(res.watch);
      } catch (err) {
        if (isProRequired(err)) openProUpsell("seat_watch");
        else setError(err instanceof Error ? err.message : "No pudimos activar el aviso. Probá de nuevo.");
      } finally {
        setPending(false);
      }
    },
    [path, seat, tableSeats],
  );

  const cancel = useCallback(async () => {
    setError(null);
    setPending(true);
    try {
      await apiDelete(path);
      setWatch(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cancelar el aviso. Probá de nuevo.");
    } finally {
      setPending(false);
    }
  }, [path]);

  if (checkedInHere || !signedIn || lock === "unknown") return null;

  const locked = lock === "locked";
  const request = (mode: SeatWatchMode) => () => {
    if (lock === "locked") openProUpsell("seat_watch");
    else void start(mode);
  };
  const watching = lock === "unlocked" && watch != null && watch.expiresAt ? watch : null;
  const watchingThis = watching != null && (isWatchingMode(watching.seatIds, "seat", seat, tableSeats) || isWatchingMode(watching.seatIds, "table", seat, tableSeats));

  return (
    <div className="flex flex-col gap-2 border-t border-app pt-3">
      {watching && watchingThis ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="flex items-center gap-2 text-sm font-semibold text-main">
            <BellRingingIcon aria-hidden="true" size={18} />
            Te avisamos hasta las {clockLabel(watching.expiresAt)}
          </p>
          <button type="button" onClick={() => void cancel()} disabled={pending} className={actionClass}>
            Cancelar aviso
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={request("seat")}
            disabled={pending}
            aria-label={proLabel("Avisame cuando se libere", locked)}
            className={`${actionClass} ${locked ? "relative" : ""}`}
          >
            Avisame cuando se libere
            {locked ? <ProBadge /> : null}
          </button>
          <button
            type="button"
            onClick={request("table")}
            disabled={pending}
            aria-label={proLabel("Avisame si se libera cualquier lugar de esta mesa", locked)}
            className={`${actionClass} ${locked ? "relative" : ""}`}
          >
            Avisame si se libera cualquier lugar de esta mesa
            {locked ? <ProBadge /> : null}
          </button>
          <p className="text-xs text-muted">Solo te avisamos: no te guarda el lugar.</p>
        </>
      )}
      {error ? (
        <p role="alert" className="text-xs text-[var(--seat-occupied)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
