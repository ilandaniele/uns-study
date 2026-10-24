"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TimerIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import type { CheckInDto, DisputeVoteAvailableEvent, SeatDisputeDto, SeatDisputeLiteDto } from "@sala/contracts";
import { SocketEvents } from "@sala/contracts/events";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-store";
import { getSocket } from "@/lib/socket";
import { useNow } from "@/lib/use-now";
import { disputeCountdownLabel } from "./format";
import { eligibleVoteNotice } from "./vote-notices";

/** Personal-channel invitations work on every page, not only the room map. */
export function VoteNotification() {
  const { me } = useMe();
  if (!me?.user || !me.activeCheckIn) return null;
  return <VoteNotificationSession key={`${me.user.id}:${me.activeCheckIn.id}`} checkIn={me.activeCheckIn} />;
}

function VoteNotificationSession({ checkIn }: { checkIn: CheckInDto }) {
  const [notices, setNotices] = useState<DisputeVoteAvailableEvent[]>([]);
  const dismissed = useRef(new Set<string>());
  const roomId = checkIn?.roomId;
  const seatId = checkIn?.seatId;
  const expiresAt = checkIn?.expiresAt;

  useEffect(() => {
    if (!roomId || !seatId || !expiresAt) return;
    let cancelled = false;
    const current = { roomId, seatId, expiresAt };
    const receive = (event: DisputeVoteAvailableEvent) => {
      if (cancelled || dismissed.current.has(event.disputeId) || !eligibleVoteNotice(event, current, Date.now())) return;
      setNotices((previous) => [...previous.filter((item) => item.disputeId !== event.disputeId), event]);
    };
    const resolved = (event: SeatDisputeLiteDto) => {
      dismissed.current.add(event.id);
      setNotices((previous) => previous.filter((item) => item.disputeId !== event.id));
    };
    // Recover invitations missed while offline. Already-voted disputes do not nudge again.
    const reconcile = () => {
      if (Date.parse(expiresAt) <= Date.now()) return;
      void apiFetch<SeatDisputeDto[]>(`/api/v1/rooms/${encodeURIComponent(roomId)}/disputes`).then((votes) => {
        if (cancelled) return;
        for (const vote of votes) {
          if (vote.status === "OPEN" && !vote.iAmOpener && !vote.iAmIncumbent && !vote.myVote) {
            receive({ disputeId: vote.id, roomId, roomSlug: roomId, seatId: vote.seatId, seatCode: "", closesAt: vote.closesAt });
          }
        }
      }).catch(() => undefined);
    };
    const onVisible = () => { if (!document.hidden) reconcile(); };
    const socket = getSocket();
    socket.on(SocketEvents.DisputeVoteAvailable, receive);
    socket.on(SocketEvents.SeatDisputeResolved, resolved);
    socket.on("connect", reconcile);
    document.addEventListener("visibilitychange", onVisible);
    reconcile();
    return () => {
      cancelled = true;
      socket.off(SocketEvents.DisputeVoteAvailable, receive);
      socket.off(SocketEvents.SeatDisputeResolved, resolved);
      socket.off("connect", reconcile);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [roomId, seatId, expiresAt]);

  useEffect(() => {
    if (!expiresAt || notices.length === 0) return;
    const deadline = Math.min(Date.parse(expiresAt), ...notices.map((item) => Date.parse(item.closesAt)));
    const timer = setTimeout(() => setNotices((previous) => previous.filter((item) => eligibleVoteNotice(item, checkIn, Date.now()))), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [notices, expiresAt, checkIn]);

  // Deadlines are enforced on receipt and by the expiry timeout; rendering stays clock-free.
  const active = notices.filter((event) => checkIn != null && event.roomId === checkIn.roomId && event.seatId !== checkIn.seatId)
    .sort((a, b) => Date.parse(a.closesAt) - Date.parse(b.closesAt));
  const event = active[0];
  if (!event) return null;
  const dismiss = () => {
    dismissed.current.add(event.disputeId);
    setNotices((previous) => previous.filter((item) => item.disputeId !== event.disputeId));
  };
  return <VoteNotificationPanel event={event} additional={active.length - 1} onDismiss={dismiss} />;
}

function VoteNotificationPanel({ event, additional, onDismiss }: { event: DisputeVoteAvailableEvent; additional: number; onDismiss: () => void }) {
  const now = useNow(1000);
  return (
    <section aria-label="Votación en tu sala" className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-sm rounded-float border border-app bg-surface p-4 shadow-xl lg:bottom-4">
      <div className="flex items-start gap-3">
        <TimerIcon size={24} aria-hidden="true" className="mt-1 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p role="status" className="font-semibold">Hay una votación en tu sala</p>
          {event.seatCode && <p className="text-sm text-muted">Lugar {event.seatCode}</p>}
          <p className="mt-1 text-sm">Tiempo para votar: <time dateTime={event.closesAt} aria-live="off" className="font-mono font-semibold">{disputeCountdownLabel(event.closesAt, now)}</time></p>
          {additional > 0 && <p className="text-xs text-muted">{additional === 1 ? "Otra votación pendiente." : `${additional} votaciones más pendientes.`}</p>}
        </div>
        <button type="button" aria-label="Cerrar aviso de votación" onClick={onDismiss} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control hover:bg-surface-2"><XIcon size={20} aria-hidden="true" /></button>
      </div>
      <Link href={`/sala/${encodeURIComponent(event.roomSlug)}?seat=${encodeURIComponent(event.seatId)}`} onClick={onDismiss} className="mt-3 flex min-h-11 items-center justify-center rounded-control bg-primary px-4 font-semibold text-white hover:bg-primary-dark">Ver votación</Link>
    </section>
  );
}
