"use client";

import type { SeatDto } from "@uns/contracts";
import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, ArrowsCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { AdSlot } from "@/components/AdSlot";
import { AnnouncementsBanner } from "@/components/AnnouncementsBanner";
import { DisputeChallengeBanner } from "@/features/room/DisputeChallengeBanner";
import { DisputeWonBanner } from "@/features/room/DisputeWonBanner";
import { ExtendBanner } from "@/features/room/ExtendBanner";
import { MoveSeatDialog } from "@/features/room/MoveSeatDialog";
import { MyCheckInBar } from "@/features/room/MyCheckInBar";
import { Hero } from "@/features/room/Hero";
import { HowToUseModal } from "@/features/room/HowToUseModal";
import { RoomInfoPanel } from "@/features/room/RoomInfoPanel";
import { RoomMap } from "@/features/room/RoomMap";
import { RightPanelEmptyState } from "@/features/room/RightPanelEmptyState";
import { SeatDetail } from "@/features/room/SeatDetail";
import { SummaryCounters } from "@/features/room/SummaryCounters";
import { TurnstileChallenge } from "@/features/room/TurnstileChallenge";
import { checkInExpiryStatus, seatDisplayLabel, todayLabel } from "@/features/room/format";
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
  // Three-column layout (left info panel / map / right detail panel) kicks in at lg; below that,
  // detail stays a bottom sheet and the info panel collapses into a compact header + list.
  const isLargeDesktop = useMediaQuery("(min-width: 1024px)");
  const [showHowTo, setShowHowTo] = useState(false);

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
    clearError,
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
  const locallyExpired = activeCheckIn != null && !expiryStatus;

  // The active check-in expired locally (expiresAt passed); refetch /me so MY_SEAT clears once the
  // server has processed the expiration too. Keyed on id+expiresAt (primitives, stable across
  // refetches) and the `locallyExpired` boolean rather than the `activeCheckIn`/`expiryStatus`
  // objects, so a refetch that comes back with the *same* still-expired check-in (e.g. clock skew,
  // or a slow expiration job) can't re-trigger this effect and poll forever on every render — one
  // shot after 5s, then at most every 15s, until the check-in itself actually changes.
  const activeCheckInKey = activeCheckIn ? `${activeCheckIn.id}:${activeCheckIn.expiresAt}` : null;
  useEffect(() => {
    if (!locallyExpired) return;
    const initial = setTimeout(() => refetch(), 5_000);
    const poll = setInterval(() => refetch(), 15_000);
    return () => {
      clearTimeout(initial);
      clearInterval(poll);
    };
  }, [activeCheckInKey, locallyExpired, refetch]);

  const mySeatId = activeCheckIn?.seatId ?? null;
  const avatarBySeatId = useMemo(() => {
    const photos = new Map<string, string>();
    for (const [seatId, occupant] of occupantsBySeatId) if (occupant.avatarUrl) photos.set(seatId, occupant.avatarUrl);
    return photos;
  }, [occupantsBySeatId]);
  const selectedSeat = map?.seats.find((seat) => seat.id === selectedSeatId) ?? null;
  const selectedTable = selectedSeat ? map?.tables.find((t) => t.id === selectedSeat.tableId) ?? null : null;
  // Other identified occupants seated at the same table as the selected seat, for "Personas cercanas".
  const nearbyOccupants = selectedTable
    ? (map?.seats ?? [])
        .filter((seat) => seat.tableId === selectedTable.id && seat.id !== selectedSeat?.id)
        .map((seat) => occupantsBySeatId.get(seat.id))
        .filter((occupant): occupant is NonNullable<typeof occupant> => occupant != null)
    : [];

  const { dispute: selectedDispute, setDispute: setSelectedDispute } = useSeatDispute(selectedSeat?.id ?? "", selectedSeat?.dispute ?? null);
  const { challenge, clear: clearChallenge } = useIncumbentChallenge(map, me);
  const challengeSeat = challenge ? map?.seats.find((seat) => seat.id === challenge.seatId) ?? null : null;
  const challengeTable = challengeSeat ? map?.tables.find((t) => t.id === challengeSeat.tableId) ?? null : null;

  const { won: disputeWon, clear: clearDisputeWon } = useDisputeWon();
  const wonSeat = disputeWon ? map?.seats.find((seat) => seat.id === disputeWon.seatId) ?? null : null;
  const wonTable = wonSeat ? map?.tables.find((t) => t.id === wonSeat.tableId) ?? null : null;
  const mySeat = activeCheckIn ? map?.seats.find((seat) => seat.id === activeCheckIn.seatId) ?? null : null;
  const myTable = mySeat ? map?.tables.find((t) => t.id === mySeat.tableId) ?? null : null;

  // A challenge/dispute-won prompt is stale the moment its vote is reported closed — e.g. the
  // incumbent's "Sigo acá"/"Me fui" or the opener's "Estoy acá" landed just after it resolved
  // some other way. `describeActionError`'s copy for DISPUTE_CLOSED (lib/errors.ts) is the only
  // signal exposed to the UI here, since useSeatActions doesn't surface the raw error code.
  useEffect(() => {
    if (actionError === "Esta votación ya terminó.") {
      clearChallenge();
      clearDisputeWon();
    }
  }, [actionError, clearChallenge, clearDisputeWon]);

  function handleSelectSeat(seat: SeatDto) {
    const isSame = seat.id === selectedSeatId;
    setSelectedSeatId(isSame ? null : seat.id);
    setShowIdentityPrompt(false);
    clearError();
  }

  function closeDetail() {
    setSelectedSeatId(null);
    setShowIdentityPrompt(false);
    clearError();
  }

  // Target seat for a pending "Ya tenés otro lugar marcado" confirmation — set from either the
  // seat detail's "Estoy acá" or the dispute-won banner's "Estoy acá" (D3: both go through the
  // same move confirmation when the caller already holds another seat).
  const [confirmMove, setConfirmMove] = useState<{ seatId: string; fromDisputeWon: boolean } | null>(null);
  const moveTargetSeat = confirmMove ? map?.seats.find((seat) => seat.id === confirmMove.seatId) ?? null : null;
  const moveTargetTable = moveTargetSeat ? map?.tables.find((t) => t.id === moveTargetSeat.tableId) ?? null : null;

  function attemptCheckIn(seatId: string, fromDisputeWon: boolean) {
    // Already seated elsewhere: ask before moving (the API frees the old seat on move).
    if (activeCheckIn && activeCheckIn.seatId !== seatId) {
      setConfirmMove({ seatId, fromDisputeWon });
      return;
    }
    void performCheckIn(seatId, fromDisputeWon);
  }

  async function performCheckIn(seatId: string, fromDisputeWon: boolean) {
    setConfirmMove(null);
    const showIdentity = hasChosenIdentityVisibility() ? getShowIdentityPreference() : false;
    const result = await checkIn(seatId, showIdentity, { qrToken });
    if (result) {
      trackEvent("check_in", { roomSlug: slug, seatId });
      if (fromDisputeWon) clearDisputeWon();
      setShowIdentityPrompt(true);
    }
  }

  function requestCheckIn() {
    if (!selectedSeat) return;
    attemptCheckIn(selectedSeat.id, false);
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

  function handleDisputeWonCheckIn() {
    if (!disputeWon) return;
    attemptCheckIn(disputeWon.seatId, true);
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

  // Only a total loss (no map at all — first load failed) blocks the whole page. Once we have a
  // map, a later fetch failure (e.g. a dropped connection) shouldn't yank it away from under
  // whoever's looking at it — that's handled as a small non-blocking notice below instead.
  if (!map) {
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
      onCheckIn={requestCheckIn}
      onMarkFree={() => void handleMarkFree(selectedSeat.id)}
      onMarkOccupied={() => void handleMarkOccupied(selectedSeat.id)}
      onExtend={() => void extend()}
      onCheckOut={() => void checkOut()}
      dispute={selectedDispute}
      onOpenDispute={(kind) => void handleOpenDispute(kind)}
      onVoteDispute={(vote) => void handleVoteDispute(vote)}
      onChanged={handleChanged}
      now={now}
      nearbyOccupants={nearbyOccupants}
      viewBoxWidth={map.viewBox.width}
    />
  ) : null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:grid lg:grid-cols-[320px_1fr_340px] lg:items-start">
      {error ? (
        <div className="order-0 flex items-center justify-between gap-3 rounded-xl border border-app bg-surface px-3 py-2 text-sm text-muted lg:col-span-3">
          <span>Sin conexión, reintentando…</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 rounded-lg border border-app px-3 py-1.5 font-semibold text-main hover:bg-[var(--surface-2)]"
          >
            Reintentar
          </button>
        </div>
      ) : null}
      {/* Surfaced at page level (B3) so actions triggered from the banners below are visible with
          no seat selected; SeatDetail shows its own copy of these when a seat is open, so hide the
          page-level one then to avoid showing the same error/challenge twice. */}
      {!selectedSeat && actionError ? (
        <p role="alert" className="order-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 lg:col-span-3">
          {actionError}
        </p>
      ) : null}
      {!selectedSeat && turnstileRequired ? (
        <div className="order-0 lg:col-span-3">
          <TurnstileChallenge onToken={submitTurnstileToken} />
        </div>
      ) : null}
      {challenge ? (
        <div className="order-0 sticky top-0 z-50 lg:static lg:z-auto lg:col-span-3">
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
        <div className="order-0 lg:col-span-3">
          <DisputeWonBanner
            seatLabel={seatDisplayLabel(wonTable, wonSeat?.code ?? disputeWon.seatCode, wonSeat?.seatNumber ?? 0)}
            pending={pending}
            onCheckIn={handleDisputeWonCheckIn}
            onDismiss={clearDisputeWon}
          />
        </div>
      ) : null}
      {expiryStatus?.shouldPromptExtend ? (
        <div className="order-0 sticky top-0 z-50 lg:static lg:z-auto lg:col-span-3">
          <ExtendBanner
            minutesLeft={expiryStatus.minutesLeft}
            pending={pending}
            onExtend={() => void extend()}
            onCheckOut={() => void checkOut()}
          />
        </div>
      ) : activeCheckIn ? (
        <div className="order-0 lg:col-span-3">
          <MyCheckInBar
            seatLabel={seatDisplayLabel(myTable, mySeat?.code ?? activeCheckIn.seatCode, mySeat?.seatNumber ?? 0)}
            expiresAt={activeCheckIn.expiresAt}
            pending={pending}
            onShow={() => setSelectedSeatId(activeCheckIn.seatId)}
            onRelease={() => void checkOut()}
          />
        </div>
      ) : null}

      {/* Desktop (lg+) gets the full left info panel; mobile/tablet gets a compact header + counters above the map. */}
      <section className="order-1 flex flex-col gap-4 lg:order-1">
        {isLargeDesktop ? (
          <RoomInfoPanel map={map} people={people} connected={connected} onOpenHowTo={() => setShowHowTo(true)} />
        ) : (
          <>
            <div>
              <h1 className="font-display text-2xl font-bold text-main">{map.room.name}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <span
                  aria-hidden="true"
                  className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-[var(--seat-free)]" : "bg-[var(--seat-unknown)]"}`}
                />
                Abierto · {todayLabel()}
              </p>
            </div>
            <Hero summary={map.summary} seats={map.seats} />
            <SummaryCounters summary={map.summary} />
          </>
        )}
        <AnnouncementsBanner roomSlug={slug} socket={socket} />
      </section>

      <section className="order-2 flex flex-col gap-3 lg:order-2">
        <div className="relative h-[70dvh] w-full overflow-hidden rounded-3xl border border-app bg-surface shadow-sm md:h-[80dvh] lg:mx-auto lg:aspect-[5/8] lg:h-[82dvh] lg:w-auto lg:max-w-full">
          {isDesktop ? (
            <div className="flex h-full w-full items-center justify-center">
              <RoomMap
                map={map}
                mySeatId={mySeatId}
                selectedSeatId={selectedSeatId}
                onSelectSeat={handleSelectSeat}
                highlightTableCode={highlightTableCode}
                avatarBySeatId={avatarBySeatId}
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
                avatarBySeatId={avatarBySeatId}
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

      {/* Mobile/tablet: people list below the map (desktop shows it in RoomInfoPanel instead). */}
      {!isLargeDesktop ? (
        <section className="order-3">
          <div className="rounded-2xl border border-app bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-main">Personas en la sala ({people.length})</h2>
              <Link href="/personas" className="text-xs font-semibold text-primary hover:underline">
                Ver todas →
              </Link>
            </div>
            <PeopleList people={people} limit={5} />
          </div>
        </section>
      ) : null}

      {isLargeDesktop ? (
        <section className="order-4 rounded-2xl border border-app bg-surface lg:order-3">
          {detail ?? <RightPanelEmptyState hasActiveCheckIn={activeCheckIn != null} />}
        </section>
      ) : detail ? (
        <div className="sheet-enter fixed inset-x-0 bottom-0 z-40 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-app bg-surface pb-safe shadow-2xl">
          <div className="flex justify-center pt-2">
            <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-[var(--border-strong)]" />
          </div>
          {detail}
        </div>
      ) : null}

      <HowToUseModal open={showHowTo} onClose={() => setShowHowTo(false)} />
      {confirmMove && activeCheckIn ? (
        <MoveSeatDialog
          fromLabel={seatDisplayLabel(myTable, mySeat?.code ?? activeCheckIn.seatCode, mySeat?.seatNumber ?? 0)}
          toLabel={seatDisplayLabel(moveTargetTable, moveTargetSeat?.code ?? disputeWon?.seatCode ?? "", moveTargetSeat?.seatNumber ?? 0)}
          pending={pending}
          onConfirm={() => void performCheckIn(confirmMove.seatId, confirmMove.fromDisputeWon)}
          onCancel={() => setConfirmMove(null)}
        />
      ) : null}
    </main>
  );
}
