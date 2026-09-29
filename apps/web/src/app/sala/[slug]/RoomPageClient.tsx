"use client";

import type { SeatAvatarDto, SeatDto } from "@uns/contracts";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdSlot } from "@/components/AdSlot";
import { AnnouncementsBanner } from "@/components/AnnouncementsBanner";
import { ActiveCheckInBanner } from "@/features/room/ActiveCheckInBanner";
import { RoomSkeleton } from "@/features/room/RoomSkeleton";
import { AdminPresentBanner } from "@/features/room/AdminPresentBanner";
import { Hero } from "@/features/room/Hero";
import { RoomInfoPanel } from "@/features/room/RoomInfoPanel";
import { RoomMap } from "@/features/room/RoomMap";
import { RightPanelEmptyState } from "@/features/room/RightPanelEmptyState";
import { SummaryCounters } from "@/features/room/SummaryCounters";
import { freedSeatsToastMessage, seatDisplayLabel, todayLabel } from "@/features/room/format";
import { useDisputeWon } from "@/features/room/useDisputeWon";
import { useIncumbentChallenge } from "@/features/room/useIncumbentChallenge";
import { useRoomAlerts } from "@/features/room/useRoomAlerts";
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

// Rarely-needed UI is split out of the initial bundle. Desktop never downloads the zoom library.
const DisputeChallengeBanner = dynamic(() => import("@/features/room/DisputeChallengeBanner").then((m) => m.DisputeChallengeBanner));
const DisputeWonBanner = dynamic(() => import("@/features/room/DisputeWonBanner").then((m) => m.DisputeWonBanner));
const EnableSeatFreedCta = dynamic(() => import("@/features/room/EnableSeatFreedCta").then((m) => m.EnableSeatFreedCta));
const HowToUseModal = dynamic(() => import("@/features/room/HowToUseModal").then((m) => m.HowToUseModal));
const MoveSeatDialog = dynamic(() => import("@/features/room/MoveSeatDialog").then((m) => m.MoveSeatDialog));
const SeatFreedToast = dynamic(() => import("@/features/room/SeatFreedToast").then((m) => m.SeatFreedToast));
const TurnstileChallenge = dynamic(() => import("@/features/room/TurnstileChallenge").then((m) => m.TurnstileChallenge));
const ZoomableMap = dynamic(() => import("@/features/room/ZoomableMap"));
const loadSeatDetail = () => import("@/features/room/SeatDetail").then((m) => m.SeatDetail);
const SeatDetail = dynamic(loadSeatDetail);

export function RoomPageClient({ slug }: { slug: string }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // Three-column layout (left info panel / map / right detail panel) kicks in at lg; below that,
  // detail stays a bottom sheet and the info panel collapses into a compact header + list.
  const isLargeDesktop = useMediaQuery("(min-width: 1024px)");
  const [showHowTo, setShowHowTo] = useState(false);

  const { map, me, connected, loading, error, refetch } = useRoomState(slug);
  const { bySeatId: occupantsBySeatId, markedBySeatId, refetch: refetchOccupants } = useOccupants(slug);
  const { people } = usePeople(slug);
  const { highlightTableCode, qrToken } = useQrContext();
  const socket = useMemo(() => getSocket(), []);
  const { toast, dismissToast, adminBanner, dismissAdminBanner } = useRoomAlerts();
  const searchParams = useSearchParams();

  useEffect(() => {
    trackEvent("room_view", { roomSlug: slug });
  }, [slug]);

  // First load failed (no map yet): keep retrying with exponential backoff (2 s, 4 s ... capped at 30 s).
  const [loadAttempts, setLoadAttempts] = useState(0);
  const firstLoadFailed = !loading && !map && error != null;
  useEffect(() => {
    if (!firstLoadFailed) return;
    const id = setTimeout(
      () => {
        setLoadAttempts((n) => n + 1);
        refetch();
      },
      Math.min(2_000 * 2 ** loadAttempts, 30_000),
    );
    return () => clearTimeout(id);
  }, [firstLoadFailed, loadAttempts, refetch]);

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
    locating,
    updateIdentity,
    openDispute,
    voteDispute,
    respondDispute,
  } = useSeatActions(map, handleChanged);

  // The zoom wrapper is mobile-only; wait until the media queries have resolved so desktop never loads it.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot "hydrated" flag
  useEffect(() => setMounted(true), []);
  const preloadedDetail = useRef(false);
  const preloadSeatDetail = useCallback(() => {
    if (preloadedDetail.current) return;
    preloadedDetail.current = true;
    void loadSeatDetail();
  }, []);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [showIdentityPrompt, setShowIdentityPrompt] = useState(false);

  // Deep link (?seat=<id>, e.g. from a "seat freed" push notification): select it once the map has
  // loaded and confirms the seat actually exists. Only runs once per landing — after that, seat
  // selection is fully driven by clicks on the map, not by the URL.
  const dispatchedSeatParam = useRef(false);
  useEffect(() => {
    if (dispatchedSeatParam.current || !map) return;
    const seatParam = searchParams.get("seat");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot sync from the URL on landing, not a render loop
    if (seatParam && map.seats.some((s) => s.id === seatParam)) setSelectedSeatId(seatParam);
    dispatchedSeatParam.current = true;
  }, [map, searchParams]);

  const activeCheckIn = me?.activeCheckIn ?? null;

  const mySeatId = activeCheckIn?.seatId ?? null;
  const avatarBySeatId = useMemo(() => {
    const avatars = new Map<string, SeatAvatarDto>();
    for (const [seatId, occupant] of occupantsBySeatId) avatars.set(seatId, occupant.avatar);
    return avatars;
  }, [occupantsBySeatId]);
  const seatById = useMemo(() => new Map((map?.seats ?? []).map((seat) => [seat.id, seat])), [map]);
  const tableById = useMemo(() => new Map((map?.tables ?? []).map((table) => [table.id, table])), [map]);
  const selectedSeat = (selectedSeatId ? seatById.get(selectedSeatId) : null) ?? null;
  const selectedTable = (selectedSeat ? tableById.get(selectedSeat.tableId) : null) ?? null;
  // Other identified (linkable) occupants seated at the same table as the selected seat, for "Personas cercanas".
  const nearbyOccupants = useMemo(() => {
    if (!selectedTable) return [];
    return (map?.seats ?? [])
      .filter((seat) => seat.tableId === selectedTable.id && seat.id !== selectedSeatId)
      .map((seat) => occupantsBySeatId.get(seat.id))
      .filter((occupant): occupant is NonNullable<typeof occupant> => occupant != null && occupant.userId !== null);
  }, [map, selectedTable, selectedSeatId, occupantsBySeatId]);

  const { dispute: selectedDispute, setDispute: setSelectedDispute } = useSeatDispute(selectedSeat?.id ?? "", selectedSeat?.dispute ?? null);
  const { challenge, clear: clearChallenge } = useIncumbentChallenge(map, me);
  const challengeSeat = challenge ? seatById.get(challenge.seatId) ?? null : null;
  const challengeTable = challengeSeat ? tableById.get(challengeSeat.tableId) ?? null : null;

  const { won: disputeWon, clear: clearDisputeWon } = useDisputeWon();
  const wonSeat = disputeWon ? seatById.get(disputeWon.seatId) ?? null : null;
  const wonTable = wonSeat ? tableById.get(wonSeat.tableId) ?? null : null;
  const mySeat = activeCheckIn ? seatById.get(activeCheckIn.seatId) ?? null : null;
  const myTable = mySeat ? tableById.get(mySeat.tableId) ?? null : null;

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

  const handleSelectSeat = useCallback(
    (seat: SeatDto) => {
      setSelectedSeatId((current) => (current === seat.id ? null : seat.id));
      setShowIdentityPrompt(false);
      clearError();
    },
    [clearError],
  );

  const closeDetail = useCallback(() => {
    setSelectedSeatId(null);
    setShowIdentityPrompt(false);
    clearError();
  }, [clearError]);

  const openHowTo = useCallback(() => setShowHowTo(true), []);
  const closeHowTo = useCallback(() => setShowHowTo(false), []);

  // Target seat for a pending "Ya tenés otro lugar marcado" confirmation — set from either the
  // seat detail's "Estoy acá" or the dispute-won banner's "Estoy acá" (D3: both go through the
  // same move confirmation when the caller already holds another seat).
  const [confirmMove, setConfirmMove] = useState<{ seatId: string; fromDisputeWon: boolean } | null>(null);
  const moveTargetSeat = confirmMove ? seatById.get(confirmMove.seatId) ?? null : null;
  const moveTargetTable = moveTargetSeat ? tableById.get(moveTargetSeat.tableId) ?? null : null;

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
    return <RoomSkeleton />;
  }

  // Only a total loss (no map at all — first load failed) blocks the whole page. Once we have a
  // map, a later fetch failure (e.g. a dropped connection) shouldn't yank it away from under
  // whoever's looking at it — that's handled as a small non-blocking notice below instead.
  if (!map) {
    return (
      <main className="flex flex-col items-center gap-3 p-6 text-center">
        <p role="alert" className="text-red-600">
          {error ?? "No encontramos esa sala."}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-lg border border-app px-4 py-2 text-sm font-semibold text-main hover:bg-[var(--surface-2)]"
        >
          Reintentar
        </button>
      </main>
    );
  }

  const roomMap = (
    <RoomMap
      map={map}
      mySeatId={mySeatId}
      selectedSeatId={selectedSeatId}
      onSelectSeat={handleSelectSeat}
      highlightTableCode={highlightTableCode}
      avatarBySeatId={avatarBySeatId}
    />
  );

  const detail = selectedSeat ? (
    <SeatDetail
      locating={locating}
      seat={selectedSeat}
      table={selectedTable}
      me={me}
      isMySeat={selectedSeat.id === mySeatId}
      occupant={occupantsBySeatId.get(selectedSeat.id) ?? null}
      markedBy={markedBySeatId.get(selectedSeat.id)?.markedBy ?? null}
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
      {adminBanner ? (
        <div className="order-0 lg:col-span-3">
          <AdminPresentBanner onDismiss={dismissAdminBanner} />
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
      {activeCheckIn ? (
        <ActiveCheckInBanner
          activeCheckIn={activeCheckIn}
          seatLabel={seatDisplayLabel(myTable, mySeat?.code ?? activeCheckIn.seatCode, mySeat?.seatNumber ?? 0)}
          pending={pending}
          onShow={() => setSelectedSeatId(activeCheckIn.seatId)}
          onExtend={() => void extend()}
          onCheckOut={() => void checkOut()}
          refetch={refetch}
        />
      ) : null}

      {/* Desktop (lg+) gets the full left info panel; mobile/tablet gets a compact header + counters above the map. */}
      <section className="order-1 flex flex-col gap-4 lg:order-1">
        {isLargeDesktop ? (
          <RoomInfoPanel map={map} people={people} connected={connected} onOpenHowTo={openHowTo} />
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
        {map.summary.free === 0 ? <EnableSeatFreedCta /> : null}
        <AnnouncementsBanner roomSlug={slug} socket={socket} />
      </section>

      <section className="order-2 flex flex-col gap-3 lg:order-2">
        <div
          onPointerDownCapture={preloadSeatDetail}
          className="relative h-[70dvh] w-full overflow-hidden rounded-3xl border border-app bg-surface shadow-sm md:h-[80dvh] lg:mx-auto lg:aspect-[5/8] lg:h-[82dvh] lg:w-auto lg:max-w-full"
        >
          {isDesktop || !mounted ? (
            <div className="flex h-full w-full items-center justify-center">{roomMap}</div>
          ) : (
            <ZoomableMap>{roomMap}</ZoomableMap>
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

      <HowToUseModal open={showHowTo} onClose={closeHowTo} />
      {confirmMove && activeCheckIn ? (
        <MoveSeatDialog
          fromLabel={seatDisplayLabel(myTable, mySeat?.code ?? activeCheckIn.seatCode, mySeat?.seatNumber ?? 0)}
          toLabel={seatDisplayLabel(moveTargetTable, moveTargetSeat?.code ?? disputeWon?.seatCode ?? "", moveTargetSeat?.seatNumber ?? 0)}
          pending={pending}
          onConfirm={() => void performCheckIn(confirmMove.seatId, confirmMove.fromDisputeWon)}
          onCancel={() => setConfirmMove(null)}
        />
      ) : null}
      {toast ? (
        <SeatFreedToast
          message={freedSeatsToastMessage(map, toast.seatIds)}
          onView={
            toast.seatIds.length === 1
              ? () => {
                  setSelectedSeatId(toast.seatIds[0]!);
                  dismissToast();
                }
              : undefined
          }
          onDismiss={dismissToast}
        />
      ) : null}
    </main>
  );
}
