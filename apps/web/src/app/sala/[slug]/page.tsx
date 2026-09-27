"use client";

import type { SeatDto } from "@uns/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { AdSlot } from "@/components/AdSlot";
import { AnnouncementsBanner } from "@/components/AnnouncementsBanner";
import { ExtendBanner } from "@/features/room/ExtendBanner";
import { Legend } from "@/features/room/Legend";
import { RoomMap } from "@/features/room/RoomMap";
import { SeatDetail } from "@/features/room/SeatDetail";
import { SummaryCounters } from "@/features/room/SummaryCounters";
import { checkInExpiryStatus } from "@/features/room/format";
import { useRoomState } from "@/features/room/useRoomState";
import { useSeatActions } from "@/features/room/useSeatActions";
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

  async function handleIdentityChoice(showIdentity: boolean) {
    setShowIdentityPreference(showIdentity);
    setShowIdentityPrompt(false);
    await updateIdentity(showIdentity);
    refetchOccupants();
  }

  if (loading) {
    return <main className="p-6 text-center text-slate-500">Cargando sala…</main>;
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
    />
  ) : null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:grid md:grid-cols-[260px_1fr_320px] md:items-start">
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
          <h1 className="text-xl font-bold text-slate-900">{map.room.name}</h1>
          <p className="text-xs text-slate-500">{connected ? "Datos en vivo" : "Reconectando…"}</p>
        </div>
        <SummaryCounters summary={map.summary} />
        <AnnouncementsBanner roomSlug={slug} socket={socket} />
        {isDesktop ? <Legend /> : null}
        {isDesktop ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Personas en la sala</h2>
              <Link href="/personas" className="text-xs font-semibold text-primary hover:underline">
                Ver todas
              </Link>
            </div>
            <PeopleList people={people} limit={5} />
          </div>
        ) : null}
      </section>

      <section className="order-2 flex flex-col gap-3 md:order-2">
        <div className="relative h-[70vh] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white md:h-[80vh]">
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
              <button
                type="button"
                onClick={() => zoomRef.current?.resetTransform()}
                aria-label="Restablecer zoom"
                className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-lg shadow-md"
              >
                <span aria-hidden="true">⟲</span>
              </button>
            </>
          )}
        </div>
        {!isDesktop ? <Legend /> : null}
        <AdSlot placement="room-bottom" />
      </section>

      {isDesktop ? (
        <section className="order-3 rounded-2xl border border-slate-200 bg-white">
          {detail ?? <p className="p-4 text-sm text-slate-500">Elegí un lugar en el mapa para ver los detalles.</p>}
        </section>
      ) : detail ? (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white pb-safe shadow-2xl">
          <div className="flex justify-center pt-2">
            <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-slate-300" />
          </div>
          {detail}
        </div>
      ) : null}
    </main>
  );
}
