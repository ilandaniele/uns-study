"use client";

import type { SeatDto } from "@uns/contracts";
import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, ArrowsCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { AdSlot } from "@/components/AdSlot";
import { AnnouncementsBanner } from "@/components/AnnouncementsBanner";
import { DisputeChallengeBanner } from "@/features/room/DisputeChallengeBanner";
import { DisputeWonBanner } from "@/features/room/DisputeWonBanner";
import { ExtendBanner } from "@/features/room/ExtendBanner";
import { Hero } from "@/features/room/Hero";
import { RoomMap } from "@/features/room/RoomMap";
import { SeatDetail } from "@/features/room/SeatDetail";
import { SummaryCounters } from "@/features/room/SummaryCounters";
import { checkInExpiryStatus, seatDisplayLabel } from "@/features/room/format";
import { useDisputeWon } from "@/features/room/useDisputeWon";
import { useIncumbentChallenge } from "@/features/room/useIncumbentChallenge";
import { useRoomState } from "@/features/room/useRoomState";
import { useSeatActions } from "@/features/room/useSeatActions";
import { useSeatDispute } from "@/features/room/useSeatDispute";
import { PeopleList } from "@/features/people/PeopleList";
import { useOccupants } from "@/features/people/useOccupants";
import { usePeople } from "@/features/people/usePeople";
import { trackEvent } from "@/lib/analytics";
import { getShowIdentityPreference, hasChosenIdentityVisibility, setShowIdentityPreference } from "@/lib/identity-prefs";
import { useQrContext } from "@/lib/qr-context";
import { getSocket } from "@/lib/socket";
import { useMediaQuery } from "@/lib/use-media-query";

export default function RoomPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const { map, me, connected, loading, error, refetch } = useRoomState(slug);
  const { bySeatId: occupantsBySeatId, refetch: refetchOccupants } = useOccupants(slug);
  const { people } = usePeople(slug);
  const { highlightTableCode, qrToken } = useQrContext();
  const socket = getSocket();

  useEffect(() => {
    trackEvent("room_view", { roomSlug: slug });
  }, [slug]);

  const handleChanged = useCallback(() => {
    refetch();
    refetchOccupants();
  }, [refetch, refetchOccupants]);

  const {
    pending,
    actionError,
    turnstileRequired,
    submitTurnstileToken,
    checkIn,
    markFree,
    markOccupied,
    extend,
    checkOut,
    updateIdentity,
    openDispute,
    voteDispute,
    respondDispute,
  } = useSeatActions(map, handleChanged);

  const zoomRef = useRef<ReactZoomPanPinchRef>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [showIdentityPrompt, setShowIdentityPrompt] = useState(false);

  // Ticks every 30s so the "¿Seguís acá?" banner's minutes-left stays fresh.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const activeCheckIn = me?.activeCheckIn ?? null;
  const expiryStatus = activeCheckIn ? checkInExpiryStatus(activeCheckIn.expiresAt, now) : null;

  useEffect(() => {
    // The active check-in expired locally (expiresAt passed); refetch /me so MY_SEAT clears
    // once the server has processed the expiration too.
    if (activeCheckIn && !expiryStatus) {
      refetch();
    }
  }, [activeCheckIn, expiryStatus, refetch]);

  const mySeatId = activeCheckIn?.seatId ?? null;
  const selectedSeat = map?.seats.find((seat) => seat.id === selectedSeatId) ?? null;
  const selectedTable = selectedSeat ? map?.tables.find((t) => t.id === selectedSeat.tableId) ?? null : null;

  const { dispute: selectedDispute, setDispute: setSelectedDispute } = useSeatDispute(selectedSeat?.id ?? "", selectedSeat?.dispute ?? null);
  const { challenge, clear: clearChallenge } = useIncumbentChallenge(map, me);
  const challengeSeat = challenge ? map?.seats.find((seat) => seat.id === challenge.seatId) ?? null : null;
  const challengeTable = challengeSeat ? map?.tables.find((t) => t.id === challengeSeat.tableId) ?? null : null;

  const { won: disputeWon, clear: clearDisputeWon } = useDisputeWon();
  const wonSeat = disputeWon ? map?.seats.find((seat) => seat.id === disputeWon.seatId) ?? null : null;
  const wonTable = wonSeat ? map?.tables.find((t) => t.id === wonSeat.tableId) ?? null : null;

  function handleSelectSeat(seat: SeatDto) {
    const isSame = seat.id === selectedSeatId;
    setSelectedSeatId(isSame ? null : seat.id);
    setShowIdentityPrompt(false);
  }

  function closeDetail() {
    setSelectedSeatId(null);
    setShowIdentityPrompt(false);
  }

  async function handleCheckIn() {
    if (!selectedSeat) return;
    const showIdentity = hasChosenIdentityVisibility() ? getShowIdentityPreference() : false;
    const result = await checkIn(selectedSeat.id, showIdentity, { qrToken });
    if (result) {
      trackEvent("check_in", { roomSlug: slug, seatId: selectedSeat.id });
      setShowIdentityPrompt(true);
    }
  }

  async function handleMarkFree(seatId: string) {
    const ok = await markFree(seatId, { qrToken });
    if (ok) trackEvent("observation", { roomSlug: slug, seatId, status: "FREE" });
  }

  async function handleMarkOccupied(seatId: string) {
    const ok = await markOccupied(seatId, { qrToken });
    if (ok) trackEvent("observation", { roomSlug: slug, seatId, status: "OCCUPIED" });
  }

  async function handleOpenDispute(kind: Parameters<typeof openDispute>[1]) {
    if (!selectedSeat) return;
    const result = await openDispute(selectedSeat.id, kind);
    if (result) setSelectedDispute(result);
  }

  async function handleVoteDispute(vote: Parameters<typeof voteDispute>[1]) {
    if (!selectedDispute) return;
    const result = await voteDispute(selectedDispute.id, vote);
    if (result) setSelectedDispute(result);
  }

  async function handleChallengeStillHere() {
    if (!challenge) return;
    const result = await respondDispute(challenge.disputeId, "STILL_HERE");
    if (result) clearChallenge();
  }

  async function handleChallengeLeft() {
    if (!challenge) return;
    const result = await respondDispute(challenge.disputeId, "LEFT");
    if (result) clearChallenge();
  }

  async function handleDisputeWonCheckIn() {
    if (!disputeWon) return;
    const showIdentity = hasChosenIdentityVisibility() ? getShowIdentityPreference() : false;
    const result = await checkIn(disputeWon.seatId, showIdentity, { qrToken });
    if (result) {
      trackEvent("check_in", { roomSlug: slug, seatId: disputeWon.seatId });
      clearDisputeWon();
      setShowIdentityPrompt(true);
    }
  }

  async function handleIdentityChoice(showIdentity: boolean) {
    setShowIdentityPreference(showIdentity);
    setShowIdentityPrompt(false);
    await updateIdentity(showIdentity);
    refetchOccupants();
  }

  if (loading) {
    return <main className="p-6 text-center text-muted">Cargando sala…</main>;
  }

  if (error || !map) {
    return <main className="p-6 text-center text-red-600">{error ?? "No encontramos esa sala."}</main>;
  }

  const detail = selectedSeat ? (
    <SeatDetail
      seat={selectedSeat}
      table={selectedTable}
      me={me}
      isMySeat={selectedSeat.id === mySeatId}
      occupant={occupantsBySeatId.get(selectedSeat.id) ?? null}
      pending={pending}
      actionError={actionError}
      turnstileRequired={turnstileRequired}
      onTurnstileToken={submitTurnstileToken}
      showIdentityPrompt={showIdentityPrompt}
      onIdentityChoice={handleIdentityChoice}
      onClose={closeDetail}
      onCheckIn={() => void handleCheckIn()}
      onMarkFree={() => void handleMarkFree(selectedSeat.id)}
      onMarkOccupied={() => void handleMarkOccupied(selectedSeat.id)}
      onExtend={() => void extend()}
      onCheckOut={() => void checkOut()}
      dispute={selectedDispute}
      onOpenDispute={(kind) => void handleOpenDispute(kind)}
      onVoteDispute={(vote) => void handleVoteDispute(vote)}
      onChanged={handleChanged}
      now={now}
    />
  ) : null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:grid md:grid-cols-[260px_1fr_320px] md:items-start">
      {challenge ? (
        <div className="order-0 md:col-span-3">
          <DisputeChallengeBanner
            seatLabel={seatDisplayLabel(challengeTable, challengeSeat?.code ?? "", challengeSeat?.seatNumber ?? 0)}
            closesAt={challenge.closesAt}
            pending={pending}
            onStillHere={() => void handleChallengeStillHere()}
            onLeft={() => void handleChallengeLeft()}
          />
        </div>
      ) : null}
      {disputeWon ? (
        <div className="order-0 md:col-span-3">
          <DisputeWonBanner
            seatLabel={seatDisplayLabel(wonTable, wonSeat?.code ?? disputeWon.seatCode, wonSeat?.seatNumber ?? 0)}
            pending={pending}
            onCheckIn={() => void handleDisputeWonCheckIn()}
            onDismiss={clearDisputeWon}
          />
        </div>
      ) : null}
      {expiryStatus?.shouldPromptExtend ? (
        <div className="order-0 md:col-span-3">
          <ExtendBanner
            minutesLeft={expiryStatus.minutesLeft}
            pending={pending}
            onExtend={() => void extend()}
            onCheckOut={() => void checkOut()}
          />
        </div>
      ) : null}

      <section className="order-1 flex flex-col gap-4 md:order-1">
        <div>
          <h1 className="font-display text-2xl font-bold text-main">{map.room.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-[var(--seat-free)]" : "bg-[var(--seat-unknown)]"}`}
            />
            {connected ? "Datos en vivo" : "Reconectando…"}
          </p>
        </div>
        <Hero summary={map.summary} seats={map.seats} />
        <SummaryCounters summary={map.summary} />
        <AnnouncementsBanner roomSlug={slug} socket={socket} />
        {isDesktop ? (
          <div className="rounded-2xl border border-app bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-main">Personas en la sala</h2>
              <Link href="/personas" className="text-xs font-semibold text-primary hover:underline">
                Ver todas
              </Link>
            </div>
            <PeopleList people={people} limit={5} />
          </div>
        ) : null}
      </section>

      <section className="order-2 flex flex-col gap-3 md:order-2">
        <div className="relative h-[70vh] w-full overflow-hidden rounded-3xl border border-app bg-surface shadow-sm md:h-[80vh] lg:mx-auto lg:aspect-[5/8] lg:h-[82vh] lg:w-auto lg:max-w-full">
          {isDesktop ? (
            <div className="flex h-full w-full items-center justify-center">
              <RoomMap
                map={map}
                mySeatId={mySeatId}
                selectedSeatId={selectedSeatId}
                onSelectSeat={handleSelectSeat}
                highlightTableCode={highlightTableCode}
              />
            </div>
          ) : (
            <>
              <TransformWrapper ref={zoomRef} minScale={0.5} maxScale={4} initialScale={1} limitToBounds>
                <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%" }}>
                  <RoomMap
                    map={map}
                    mySeatId={mySeatId}
                    selectedSeatId={selectedSeatId}
                    onSelectSeat={handleSelectSeat}
                    highlightTableCode={highlightTableCode}
                  />
                </TransformComponent>
              </TransformWrapper>
              <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl border border-app bg-surface shadow-md">
                <button
                  type="button"
                  onClick={() => zoomRef.current?.zoomIn()}
                  aria-label="Acercar"
                  className="flex h-10 w-10 items-center justify-center text-main hover:bg-[var(--surface-2)]"
                >
                  <MagnifyingGlassPlusIcon aria-hidden="true" size={20} />
                </button>
                <div className="h-px bg-[var(--border)]" />
                <button
                  type="button"
                  onClick={() => zoomRef.current?.zoomOut()}
                  aria-label="Alejar"
                  className="flex h-10 w-10 items-center justify-center text-main hover:bg-[var(--surface-2)]"
                >
                  <MagnifyingGlassMinusIcon aria-hidden="true" size={20} />
                </button>
                <div className="h-px bg-[var(--border)]" />
                <button
                  type="button"
                  onClick={() => zoomRef.current?.resetTransform()}
                  aria-label="Restablecer zoom"
                  className="flex h-10 w-10 items-center justify-center text-main hover:bg-[var(--surface-2)]"
                >
                  <ArrowsCounterClockwiseIcon aria-hidden="true" size={20} />
                </button>
              </div>
            </>
          )}
        </div>
        <AdSlot placement="room-bottom" />
      </section>

      {isDesktop ? (
        <section className="order-3 rounded-2xl border border-app bg-surface">
          {detail ?? <p className="p-4 text-sm text-muted">Elegí un lugar en el mapa para ver los detalles.</p>}
        </section>
      ) : detail ? (
        <div className="sheet-enter fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-app bg-surface pb-safe shadow-2xl">
          <div className="flex justify-center pt-2">
            <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-[var(--border-strong)]" />
          </div>
          {detail}
        </div>
      ) : null}
    </main>
  );
}
