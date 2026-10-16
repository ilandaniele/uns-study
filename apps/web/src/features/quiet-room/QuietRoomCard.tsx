"use client";

import { useCallback, useEffect, useState } from "react";
import { SocketEvents } from "@sala/contracts/events";
import { QUIET_ROOM_THRESHOLDS, type QuietRoomThreshold, type QuietWatchResponse, type RoomSummary } from "@sala/contracts";
import { BellRingingIcon } from "@phosphor-icons/react/dist/ssr";
import { clockLabel } from "@/features/room/checkin-duration";
import { apiDelete, apiFetch, apiPut, enc, isProRequired } from "@/features/pro/pro-api";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { ProBadge, proLabel } from "@/features/subscriptions/ProBadge";
import { usePro } from "@/features/subscriptions/usePro";
import { useMe } from "@/lib/me-store";
import { enablePushNotificationsDetailed, getPushSupportState, pushFailureMessage } from "@/lib/push";
import { getSocket } from "@/lib/socket";
import { QUIET_THRESHOLD_META, thresholdAlreadyMet } from "./quiet-room";

export interface QuietRoomCardProps {
  roomSlug: string;
  summary: RoomSummary;
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

const buttonClass =
  "min-h-11 rounded-control border border-app bg-surface px-3 py-2 text-left text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50";

/** Pro: "Aviso sala tranquila" — one-shot alert when the room drops to the chosen occupancy. Only notifies. */
export function QuietRoomCard({ roomSlug, summary, checkedInHere }: QuietRoomCardProps) {
  const { me } = useMe();
  const { lock } = usePro();
  const signedIn = me?.user != null;
  const [watch, setWatch] = useState<QuietWatchResponse["watch"]>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = `/api/v1/rooms/${enc(roomSlug)}/quiet-watch`;

  useEffect(() => {
    if (lock !== "unlocked" || !signedIn) return;
    let cancelled = false;
    apiFetch<QuietWatchResponse>(path)
      .then((res) => {
        if (!cancelled) setWatch(res.watch);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lock, signedIn, path]);

  // The server consumes the watch when it fires; mirror that locally.
  useEffect(() => {
    if (lock !== "unlocked" || !signedIn) return;
    const socket = getSocket();
    const onAlert = () => setWatch(null);
    socket.on(SocketEvents.QuietRoomAlert, onAlert);
    return () => {
      socket.off(SocketEvents.QuietRoomAlert, onAlert);
    };
  }, [lock, signedIn]);

  const start = useCallback(
    async (thresholdPct: QuietRoomThreshold) => {
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
        const res = await apiPut<QuietWatchResponse>(path, { thresholdPct });
        setWatch(res.watch);
      } catch (err) {
        if (isProRequired(err)) openProUpsell("quiet_room");
        else setError(err instanceof Error ? err.message : "No pudimos activar el aviso. Probá de nuevo.");
      } finally {
        setPending(false);
      }
    },
    [path],
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

  if (lock === "locked") {
    return (
      <section aria-label="Aviso sala tranquila" className="flex flex-col gap-2 rounded-lg border border-app bg-surface p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-main">
          Aviso sala tranquila
          <ProBadge inline />
        </p>
        <p className="text-xs text-muted">Te avisamos cuando la sala se vacía.</p>
        <button type="button" onClick={() => openProUpsell("quiet_room")} aria-label={proLabel("Avisarme", true)} className={`${buttonClass} relative`}>
          Avisarme
          <ProBadge />
        </button>
      </section>
    );
  }

  const active = watch != null && watch.expiresAt ? watch : null;

  return (
    <section aria-label="Aviso sala tranquila" className="flex flex-col gap-2 rounded-lg border border-app bg-surface p-3">
      <p className="text-sm font-semibold text-main">Aviso sala tranquila</p>
      {active ? (
        <>
          <p role="status" className="flex items-center gap-2 text-sm text-main">
            <BellRingingIcon aria-hidden="true" size={18} />
            Te avisamos cuando baje al {active.thresholdPct} % (hasta las {clockLabel(active.expiresAt)})
          </p>
          <button type="button" onClick={() => void cancel()} disabled={pending} className={buttonClass}>
            Cancelar aviso
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">Te avisamos cuando la sala baje de ocupación. Solo avisa: no guarda lugar.</p>
          <div className="grid grid-cols-3 gap-2">
            {QUIET_ROOM_THRESHOLDS.map((t) => {
              const met = thresholdAlreadyMet(summary, t);
              const meta = QUIET_THRESHOLD_META[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => void start(t)}
                  disabled={pending || met}
                  aria-label={`${meta.label}: ${meta.hint}${met ? " (ya se cumple)" : ""}`}
                  className={`${buttonClass} flex flex-col`}
                >
                  <span>{meta.label}</span>
                  <span className="text-xs font-normal text-muted">{met ? "ya se cumple" : meta.hint}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {error ? (
        <p role="alert" className="text-xs text-[var(--seat-occupied)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
