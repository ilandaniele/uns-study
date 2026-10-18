"use client";

import { prefetchLikelyNextWhenIdle } from "@/lib/prefetch";
import { primeLocation } from "@/lib/geolocation";
import type { SeatAvatarDto, SeatDto } from "@sala/contracts";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ForecastCard } from "@/features/forecast/ForecastCard";
import { QuietRoomCard } from "@/features/quiet-room/QuietRoomCard";
import { quietToastMessage } from "@/features/quiet-room/quiet-room";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FIRST_VISIT_HOW_TO_CLOSED, markHowToSeen, shouldShowHowToOnFirstVisit } from "@/features/help/how-to-seen";
import { showPreCheckInAd } from "@/features/ads/ads";
import { AnnouncementsBanner } from "@/components/AnnouncementsBanner";
import { ActiveCheckInBanner } from "@/features/room/ActiveCheckInBanner";
import { RoomSkeleton } from "@/features/room/RoomSkeleton";
import { AdminPresentBanner } from "@/features/room/AdminPresentBanner";
import { Hero } from "@/features/room/Hero";
import { RoomInfoPanel } from "@/features/room/RoomInfoPanel";
import { RoomMap } from "@/features/room/RoomMap";
import { RoomQuickActions } from "@/features/room/RoomQuickActions";
import { RoomSocialProof, UpdatedAgo } from "@/features/room/RoomSocialProof";
import { useRoomTodayStats } from "@/features/room/useRoomTodayStats";
import { useFavoriteSeats } from "@/features/room/useFavoriteSeat";
import { dueFavoriteToasts, freedFavorites } from "@/features/room/favorite-seats";
import { usePro } from "@/features/subscriptions/usePro";
import { RightPanelEmptyState } from "@/features/room/RightPanelEmptyState";
import { SummaryCounters } from "@/features/room/SummaryCounters";
import { freedSeatsToastMessage, seatDisplayLabel, todayLabel } from "@/features/room/format";
import { useDisputeWon } from "@/features/room/useDisputeWon";
import { useIncumbentChallenge } from "@/features/room/useIncumbentChallenge";
import { useRoomAlerts } from "@/features/room/useRoomAlerts";
import { ROOM_NOT_FOUND, useRoomState } from "@/features/room/useRoomState";
import { useHouseInterstitial } from "@/features/ads/ad-overlay-store";
import { QuestionIcon } from "@phosphor-icons/react/dist/ssr";
import { useSeatActions } from "@/features/room/useSeatActions";
import { useSeatDispute } from "@/features/room/useSeatDispute";
import { MarkAllOccupiedCard } from "@/features/admin/MarkAllOccupiedCard";
import { useAdminAccess } from "@/features/admin/useAdminAccess";
import { PeopleList } from "@/features/people/PeopleList";
import { useOccupants } from "@/features/people/useOccupants";
import { usePeople } from "@/features/people/usePeople";
import { trackEvent } from "@/lib/analytics";
import { hasCheckedInBefore, markCheckedIn } from "@/lib/engagement";
import { useQrContext } from "@/lib/qr-context";
import { getSocket } from "@/lib/socket";
import { useMediaQuery } from "@/lib/use-media-query";

// A loading option gives each split chunk its own Suspense boundary. Without it, the first render
// suspends up to the route loading.tsx and the whole room flashes its skeleton.
const noFallback = () => null;
// Rarely-needed UI is split out of the initial bundle. Desktop never downloads the zoom library.
const DisputeChallengeBanner = dynamic(() => import("@/features/room/DisputeChallengeBanner").then((m) => m.DisputeChallengeBanner), { loading: noFallback });
const DisputeWonBanner = dynamic(() => import("@/features/room/DisputeWonBanner").then((m) => m.DisputeWonBanner), { loading: noFallback });
const EnableSeatFreedCta = dynamic(() => import("@/features/room/EnableSeatFreedCta").then((m) => m.EnableSeatFreedCta), { loading: noFallback });
const HowToUseModal = dynamic(() => import("@/features/room/HowToUseModal").then((m) => m.HowToUseModal), { loading: noFallback });
const MoveSeatDialog = dynamic(() => import("@/features/room/MoveSeatDialog").then((m) => m.MoveSeatDialog), { loading: noFallback });
const LocationHelpDialog = dynamic(() => import("@/features/room/LocationHelpDialog").then((m) => m.LocationHelpDialog), { loading: noFallback });
const SeatFreedToast = dynamic(() => import("@/features/room/SeatFreedToast").then((m) => m.SeatFreedToast), { loading: noFallback });
const TurnstileChallenge = dynamic(() => import("@/features/room/TurnstileChallenge").then((m) => m.TurnstileChallenge), { loading: noFallback });
import { SeatSheet } from "@/features/room/SeatSheet";
import { DonateCard, DonatePrompt } from "@/features/room/Donate";
const ZoomableMap = dynamic(() => import("@/features/room/ZoomableMap"), { loading: noFallback });
const loadSeatDetail = () => import("@/features/room/SeatDetail").then((m) => m.SeatDetail);
const SeatDetail = dynamic(loadSeatDetail, { loading: noFallback });

export function RoomPageClient({ slug }: { slug: string }) {
  const { isAdmin } = useAdminAccess();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // Three-column layout (left info panel / map / right detail panel) kicks in at lg; below that,
  // detail stays a bottom sheet and the info panel collapses into a compact header + list.
  const isLargeDesktop = useMediaQuery("(min-width: 1024px)");
  const [showHowTo, setShowHowTo] = useState(false);
  const { open: adOverlayOpen } = useHouseInterstitial();

  const { map, me, connected, loading, error, refetch, updateMap } = useRoomState(slug);
  const { bySeatId: occupantsBySeatId, markedBySeatId, refetch: refetchOccupants } = useOccupants(slug);
  const { people } = usePeople(slug);
  const { highlightTableCode, qrToken } = useQrContext();
  const socket = useMemo(() => getSocket(), []);
  const { toast, dismissToast, adminBanner, dismissAdminBanner, quietAlert, dismissQuietAlert } = useRoomAlerts();
  const searchParams = useSearchParams();

  useEffect(() => {
    trackEvent("room_view", { roomSlug: slug });
  }, [slug]);

  // Once the map is on screen, warm the tabs people usually open next (idle time only).
  const mapReady = map !== null;
  useEffect(() => {
    if (mapReady) prefetchLikelyNextWhenIdle();
  }, [mapReady]);

  // A load failed (before or after the first map): keep retrying with exponential backoff (2 s, 4 s ... capped at 30 s).
  // A missing room is final, so it isn't retried.
  const [loadAttempts, setLoadAttempts] = useState(0);
  const loadFailed = !loading && error != null && error !== ROOM_NOT_FOUND;
  useEffect(() => {
    if (!loadFailed) return;
    const id = setTimeout(
      () => {
        setLoadAttempts((n) => n + 1);
        refetch();
      },
      Math.min(2_000 * 2 ** loadAttempts, 30_000),
    );
    return () => clearTimeout(id);
  }, [loadFailed, loadAttempts, refetch]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the backoff once a load succeeds
    if (error == null) setLoadAttempts(0);
  }, [error]);

  const handleChanged = useCallback(() => {
    refetch();
    refetchOccupants();
  }, [refetch, refetchOccupants]);

  const {
    pending,
    actionError,
    turnstileRequired,
    clearError,
    locationHelp,
    dismissLocationHelp,
    submitTurnstileToken,
    checkIn,
    markFree,
    markOccupied,
    markSaved,
    extend,
    checkOut,
    locating,
    openDispute,
    voteDispute,
    respondDispute,
  } = useSeatActions(map, { updateMap, refetch, refetchOccupants });

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
  // Fetch the seat panel chunk while the person looks at the map, so the first tap opens it at once.
  useEffect(() => {
    const id = window.setTimeout(preloadSeatDetail, 1500);
    return () => window.clearTimeout(id);
  }, [preloadSeatDetail]);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  // Seat the viewer just marked "Está guardado" — SeatDetail offers to report / ask to free it.
  const [savedPromptSeatId, setSavedPromptSeatId] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const { favoriteSeatIds, isFavorite, toggleFavorite, needsPro: favoriteNeedsPro, notice: favoriteNotice } = useFavoriteSeats(slug);
  const { lock: proLock } = usePro();

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
  const adminBadgeSeatIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [seatId, occupant] of occupantsBySeatId) if (occupant.adminBadge) ids.add(seatId);
    return ids;
  }, [occupantsBySeatId]);
  const seatById = useMemo(() => new Map((map?.seats ?? []).map((seat) => [seat.id, seat])), [map]);
  const tableById = useMemo(() => new Map((map?.tables ?? []).map((table) => [table.id, table])), [map]);
  // Pro: tell the viewer when one of their favorites frees up (client-only; at most once per seat per 10 min).
  const [favoriteToast, setFavoriteToast] = useState<{ seatId: string; message: string } | null>(null);
  const prevMapRef = useRef<typeof map>(null);
  const favoriteToastShownAt = useRef(new Map<string, number>());
  useEffect(() => {
    const prev = prevMapRef.current;
    prevMapRef.current = map;
    if (!map || proLock !== "unlocked" || activeCheckIn) return;
    const now = Date.now();
    const due = dueFavoriteToasts(freedFavorites(prev, map, favoriteSeatIds), favoriteToastShownAt.current, now);
    const seat = due.length > 0 ? map.seats.find((s) => s.id === due[0]) : undefined;
    if (!seat) return;
    for (const id of due) favoriteToastShownAt.current.set(id, now);
    const table = map.tables.find((t) => t.id === seat.tableId) ?? null;
    setFavoriteToast({ seatId: seat.id, message: `Tu lugar favorito ${seatDisplayLabel(table, seat.code, seat.seatNumber)} está libre` });
  }, [map, proLock, activeCheckIn, favoriteSeatIds]);
  useEffect(() => {
    if (!favoriteToast) return;
    const id = window.setTimeout(() => setFavoriteToast(null), 8000);
    return () => window.clearTimeout(id);
  }, [favoriteToast]);
  const selectedSeat = (selectedSeatId ? seatById.get(selectedSeatId) : null) ?? null;
  const selectedTable = (selectedSeat ? tableById.get(selectedSeat.tableId) : null) ?? null;
  // Mobile seat sheet: short "peek" by default; collapses again whenever another seat is picked.
  const [expandedSeatId, setExpandedSeatId] = useState<string | null>(null);
  const sheetExpanded = selectedSeatId !== null && expandedSeatId === selectedSeatId;
  const setSheetExpanded = useCallback((expanded: boolean) => setExpandedSeatId(expanded ? selectedSeatId : null), [selectedSeatId]);
  const selectedTableSeats = useMemo(
    () => (selectedSeat ? (map?.seats ?? []).filter((seat) => seat.tableId === selectedSeat.tableId) : []),
    [map, selectedSeat],
  );
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

  const signedIn = !!me?.user;
  const todayStats = useRoomTodayStats(slug, signedIn);
  const handleSelectSeat = useCallback(
    (seat: SeatDto) => {
      setSelectedSeatId((current) => (current === seat.id ? null : seat.id));
      setSavedPromptSeatId(null);
      clearError();
      // Warm the GPS while the person reads the seat panel, so "Estoy acá" answers instantly.
      if (signedIn) primeLocation();
    },
    [clearError, signedIn],
  );

  const closeDetail = useCallback(() => {
    setSelectedSeatId(null);
    setSavedPromptSeatId(null);
    clearError();
  }, [clearError]);

  // Programmatic open (quick actions): always selects, never toggles closed.
  const openSeat = useCallback(
    (seatId: string) => {
      setSelectedSeatId(seatId);
      setSavedPromptSeatId(null);
      clearError();
      if (signedIn) primeLocation();
    },
    [clearError, signedIn],
  );

  // True while the guide on screen is the one that opened by itself on a first visit.
  const howToAutoOpen = useRef(false);
  const openHowTo = useCallback(() => setShowHowTo(true), []);
  const closeHowTo = useCallback(() => {
    setShowHowTo(false);
    markHowToSeen();
    if (howToAutoOpen.current) {
      howToAutoOpen.current = false;
      // The app-open ad skipped the first load so the guide could greet the visitor; it shows now.
      window.dispatchEvent(new Event(FIRST_VISIT_HOW_TO_CLOSED));
    }
  }, []);

  // First visit on this browser (signed in or not): open the guide once, after the app-open ad closes.
  const howToAutoChecked = useRef(false);
  useEffect(() => {
    if (adOverlayOpen || howToAutoChecked.current || !shouldShowHowToOnFirstVisit()) return;
    // Short delay so the map paints first and the guide reads as a welcome, not a blocker.
    // The ref is set inside the timer so a cancelled run (ad opening, Strict Mode) can retry.
    const timer = window.setTimeout(() => {
      howToAutoChecked.current = true;
      howToAutoOpen.current = true;
      setShowHowTo(true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [adOverlayOpen]);

  // Target seat for a pending "Ya tenés otro lugar marcado" confirmation — set from either the
  // seat detail's "Estoy acá" or the dispute-won banner's "Estoy acá" (D3: both go through the
  // same move confirmation when the caller already holds another seat).
  const [confirmMove, setConfirmMove] = useState<{ seatId: string; fromDisputeWon: boolean; durationMinutes?: number } | null>(null);
  const moveTargetSeat = confirmMove ? seatById.get(confirmMove.seatId) ?? null : null;
  const moveTargetTable = moveTargetSeat ? tableById.get(moveTargetSeat.tableId) ?? null : null;

  // Escape closes the seat panel, unless a dialog is open on top of it.
  const seatOpen = selectedSeatId !== null;
  const dialogOpen = confirmMove != null || showHowTo;
  useEffect(() => {
    if (!seatOpen || dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [seatOpen, dialogOpen, closeDetail]);

  function attemptCheckIn(seatId: string, fromDisputeWon: boolean, durationMinutes?: number) {
    // Already seated elsewhere: ask before moving (the API frees the old seat on move).
    if (activeCheckIn && activeCheckIn.seatId !== seatId) {
      setConfirmMove({ seatId, fromDisputeWon, durationMinutes });
      return;
    }
    void performCheckIn(seatId, fromDisputeWon, durationMinutes);
  }

  async function performCheckIn(seatId: string, fromDisputeWon: boolean, durationMinutes?: number) {
    // Interstitial only for a device with a recorded earlier check-in (never the first, never without storage).
    if (hasCheckedInBefore()) showPreCheckInAd();
    setConfirmMove(null);
    const result = await checkIn(seatId, true, { qrToken, durationMinutes });
    if (result) {
      trackEvent("check_in", { roomSlug: slug, seatId });
      if (fromDisputeWon) clearDisputeWon();
      markCheckedIn();
    }
  }

  function requestCheckIn(durationMinutes: number) {
    if (!selectedSeat) return;
    attemptCheckIn(selectedSeat.id, false, durationMinutes);
  }

  async function handleMarkFree(seatId: string) {
    const result = await markFree(seatId, { qrToken });
    if (!result) return;
    trackEvent("observation", { roomSlug: slug, seatId, status: "FREE" });
    todayStats.bumpContribution();
    // The report opened (or joined) a vote on someone else's seat: show it to the reporter.
    if (result.dispute && result.dispute.seatId === selectedSeat?.id) setSelectedDispute(result.dispute);
  }

  async function handleMarkOccupied(seatId: string) {
    const ok = await markOccupied(seatId, { qrToken });
    if (ok) {
      trackEvent("observation", { roomSlug: slug, seatId, status: "OCCUPIED" });
      todayStats.bumpContribution();
    }
  }

  async function handleMarkSaved(seatId: string) {
    const ok = await markSaved(seatId, { qrToken });
    if (ok) {
      trackEvent("observation", { roomSlug: slug, seatId, status: "SAVED" });
      todayStats.bumpContribution();
      setSavedPromptSeatId(seatId);
    }
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
      adminBadgeSeatIds={adminBadgeSeatIds}
      onlyFree={onlyFree}
      favoriteSeatIds={favoriteSeatIds}
    />
  );

  const favoriteSeats = favoriteSeatIds.map((id) => seatById.get(id)).filter((seat): seat is SeatDto => seat !== undefined);
  const favoriteSeat = favoriteSeats.find((seat) => seat.status === "FREE") ?? favoriteSeats[0] ?? null;
  const quickActions = (
    <>
      <RoomQuickActions
        map={map}
        onlyFree={onlyFree}
        onToggleOnlyFree={() => setOnlyFree((value) => !value)}
        favoriteSeat={favoriteSeat}
        favoriteSeatIds={favoriteSeatIds}
        favoriteTable={favoriteSeat ? tableById.get(favoriteSeat.tableId) ?? null : null}
        onSelectSeat={openSeat}
      />
      <RoomSocialProof visitorsToday={todayStats.visitorsToday} myContributionsToday={todayStats.myContributionsToday} />
    </>
  );

  const detail = selectedSeat ? (
    <SeatDetail
      locating={locating}
      seat={selectedSeat}
      table={selectedTable}
      me={me}
      isMySeat={selectedSeat.id === mySeatId}
      occupant={occupantsBySeatId.get(selectedSeat.id) ?? null}
      markedBy={(() => {
        const entry = markedBySeatId.get(selectedSeat.id);
        return entry ? { ...entry.markedBy, kind: entry.kind } : null;
      })()}
      pending={pending}
      actionError={actionError}
      turnstileRequired={turnstileRequired}
      onTurnstileToken={submitTurnstileToken}
      onClose={closeDetail}
      onCheckIn={requestCheckIn}
      onMarkFree={() => void handleMarkFree(selectedSeat.id)}
      onMarkOccupied={() => void handleMarkOccupied(selectedSeat.id)}
      onMarkSaved={() => void handleMarkSaved(selectedSeat.id)}
      onExtend={() => void extend()}
      onCheckOut={() => void checkOut()}
      dispute={selectedDispute}
      onOpenDispute={(kind) => void handleOpenDispute(kind)}
      onVoteDispute={(vote) => void handleVoteDispute(vote)}
      onChanged={handleChanged}
      nearbyOccupants={nearbyOccupants}
      viewBoxWidth={map.viewBox.width}
      roomId={map.room.id}
      roomSlug={slug}
      showSavedPrompt={savedPromptSeatId === selectedSeat.id}
      onDismissSavedPrompt={() => setSavedPromptSeatId(null)}
      isFavorite={isFavorite(selectedSeat.id)}
      onToggleFavorite={() => toggleFavorite(selectedSeat.id)}
      favoriteNeedsPro={favoriteNeedsPro(selectedSeat.id)}
      tableSeats={selectedTableSeats}
      mySeatId={mySeatId}
      onSelectSeat={openSeat}
      compact={!isLargeDesktop}
      expanded={sheetExpanded}
      onExpandedChange={setSheetExpanded}
    />
  ) : null;

  const notices = (
    <>
      {isAdmin ? <MarkAllOccupiedCard roomSlug={slug} seats={map.seats} onDone={handleChanged} /> : null}
      {map.summary.free === 0 ? <EnableSeatFreedCta /> : null}
      <ForecastCard roomSlug={slug} />
      <QuietRoomCard roomSlug={slug} summary={map.summary} checkedInHere={activeCheckIn != null} />
      <AnnouncementsBanner roomSlug={slug} socket={socket} />
    </>
  );

  return (
    <main
      className={`mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:grid ${detail && !isLargeDesktop ? "pb-[62dvh]" : ""} lg:grid-cols-[auto_minmax(360px,1fr)] lg:items-start lg:gap-x-10`}
    >
      {error ? (
        <div className="order-0 flex items-center justify-between gap-3 rounded-xl border border-app bg-surface px-3 py-2 text-sm text-muted lg:col-span-full">
          <span>
            {typeof navigator !== "undefined" && navigator.onLine === false
              ? "Sin conexión, reintentando…"
              : "No pudimos actualizar el mapa, reintentando…"}
          </span>
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
        <p role="alert" className="order-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 lg:col-span-full">
          {actionError}
        </p>
      ) : null}
      {locationHelp ? <LocationHelpDialog onClose={dismissLocationHelp} /> : null}
      {!selectedSeat && turnstileRequired ? (
        <div className="order-0 lg:col-span-full">
          <TurnstileChallenge onToken={submitTurnstileToken} />
        </div>
      ) : null}
      {adminBanner ? (
        <div className="order-0 lg:col-span-full">
          <AdminPresentBanner onDismiss={dismissAdminBanner} />
        </div>
      ) : null}
      {challenge ? (
        <div className="order-0 sticky top-[65px] z-50 lg:static lg:z-auto lg:col-span-full">
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
        <div className="order-0 lg:col-span-full">
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
          locating={locating}
          hideBar={selectedSeatId === activeCheckIn.seatId}
        />
      ) : null}

      {/* Mobile/tablet: compact header + counters above the map. Desktop (lg+) gets the info rail instead. */}
      {!isLargeDesktop ? (
        <section className="order-1 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="t-heading">{map.room.name}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <span
                  aria-hidden="true"
                  className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-[var(--seat-free)]" : "bg-[var(--seat-unknown)]"}`}
                />
                {connected ? "En vivo" : "Reconectando…"} · {todayLabel()}
                <UpdatedAgo seats={map.seats} />
                <span className="sr-only" aria-live="polite">
                  {connected ? "" : "Reconectando, el mapa puede estar desactualizado"}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={openHowTo}
              aria-label="Cómo usar la app"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-[var(--surface-2)]"
            >
              <QuestionIcon size={20} />
            </button>
          </div>
          <Hero summary={map.summary} seats={map.seats} />
          {quickActions}
          {notices}
          <SummaryCounters summary={map.summary} />
        </section>
      ) : null}

      <section className="order-2 flex min-w-0 flex-col gap-3 lg:sticky lg:top-[81px] lg:order-2 lg:col-start-1">
        <div className="lg:mx-auto lg:w-fit lg:max-w-full">
          <div
            onPointerDownCapture={preloadSeatDetail}
            className="relative h-[70dvh] w-full overflow-hidden rounded-control border border-app bg-surface md:h-[80dvh] lg:mx-auto lg:aspect-[1090/1536] lg:h-[calc(100dvh-140px)] lg:w-auto lg:max-w-full"
          >
            {isDesktop || !mounted ? (
              <div className="flex h-full w-full items-center justify-center">{roomMap}</div>
            ) : (
              <ZoomableMap>{roomMap}</ZoomableMap>
            )}
          </div>
          {/* Title block under the drawing: lg only, decorative (the h1 and live status live in the rail). */}
          <div
            aria-hidden="true"
            className="t-caption hidden text-muted lg:mt-2 lg:flex lg:w-full lg:items-center lg:justify-between lg:border-t lg:border-app lg:pt-2"
          >
            <span className="t-label">{map.room.name}</span>
            <span className="t-data flex items-center gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-[var(--seat-free)]" : "bg-[var(--seat-unknown)]"}`}
              />
              {connected ? "En vivo" : "Reconectando…"}
              <UpdatedAgo seats={map.seats} />
            </span>
          </div>
        </div>
      </section>

      {/* Mobile/tablet: people list below the map (desktop shows it in RoomInfoPanel instead). */}
      {!isLargeDesktop ? (
        <section className="order-3">
          <div className="border-t border-app pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="t-title text-base">Personas en la sala ({people.length})</h2>
              <Link href="/personas" className="text-xs font-semibold text-primary hover:underline">
                Ver todas
              </Link>
            </div>
            <PeopleList people={people} limit={5} />
          </div>
        </section>
      ) : null}
      {!isLargeDesktop ? (
        <section className="order-3">
          <DonateCard />
        </section>
      ) : null}
      {mounted ? (
        <DonatePrompt blocked={detail != null || challenge != null || disputeWon != null || showHowTo || confirmMove != null || adOverlayOpen} />
      ) : null}

      {isLargeDesktop ? (
        <aside className="order-4 flex min-w-0 flex-col gap-4 pb-8 lg:order-3 lg:col-start-2">
          <RoomInfoPanel
            map={map}
            people={people}
            connected={connected}
            onOpenHowTo={openHowTo}
            quickActions={quickActions}
            detailKey={selectedSeat?.id ?? "empty"}
            detailSlot={detail ?? <RightPanelEmptyState hasActiveCheckIn={activeCheckIn != null} />}
          />
          {notices}
          <DonateCard />
        </aside>
      ) : detail ? (
        <SeatSheet expanded={sheetExpanded} onExpandedChange={setSheetExpanded} onClose={closeDetail}>
          {detail}
        </SeatSheet>
      ) : null}

      <HowToUseModal open={showHowTo} onClose={closeHowTo} />
      {confirmMove && activeCheckIn ? (
        <MoveSeatDialog
          fromLabel={seatDisplayLabel(myTable, mySeat?.code ?? activeCheckIn.seatCode, mySeat?.seatNumber ?? 0)}
          toLabel={seatDisplayLabel(moveTargetTable, moveTargetSeat?.code ?? disputeWon?.seatCode ?? "", moveTargetSeat?.seatNumber ?? 0)}
          pending={pending}
          onConfirm={() => void performCheckIn(confirmMove.seatId, confirmMove.fromDisputeWon, confirmMove.durationMinutes)}
          onCancel={() => setConfirmMove(null)}
        />
      ) : null}
      {!toast && (favoriteToast || favoriteNotice) ? (
        <SeatFreedToast
          message={favoriteNotice ?? favoriteToast!.message}
          onView={
            !favoriteNotice && favoriteToast
              ? () => {
                  setSelectedSeatId(favoriteToast.seatId);
                  setFavoriteToast(null);
                }
              : undefined
          }
          onDismiss={() => setFavoriteToast(null)}
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
      {quietAlert && !toast ? <SeatFreedToast message={quietToastMessage(quietAlert)} onDismiss={dismissQuietAlert} /> : null}
    </main>
  );
}
