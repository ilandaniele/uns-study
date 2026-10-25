"use client";

import type { DisputeKind, DisputeVote, MeDto, SeatDisputeDto, SeatDto, SeatOccupantDto, TableDto } from "@sala/contracts";
import { CaretDownIcon, EyeIcon, ShieldCheckIcon, StarIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { frameOf, nameColorStyle } from "@/components/flair";
import { ProBadge, proLabel } from "@/features/subscriptions/ProBadge";
import { proLockState } from "@/features/subscriptions/pro";
import { MessageOccupantButton } from "./MessageOccupantButton";
import { useState } from "react";
import { CheckInDialog } from "./CheckInDialog";
import { clockLabel, clockTimeAfter, DEFAULT_CHECKIN_DURATION, maxCheckInMinutes } from "./checkin-duration";
import { NearbyOccupants } from "./NearbyOccupants";
import { OccupantAvatar } from "./OccupantAvatar";
import { SavedReportPrompt } from "./SavedReportPrompt";
import { ObservationChip, PrimaryButton, QuietDangerButton, StatusPill } from "./SeatDetailParts";
import { TableLocator } from "./TableLocator";
import { markedByLabel } from "./seat-avatar";
import { TurnstileChallenge } from "./TurnstileChallenge";
import { useLocationPrompt } from "./useLocationPrompt";
import { useNow } from "@/lib/use-now";
import {
  canReportLeft,
  confidenceWording,
  recencyLabel,
  seatDisplayLabel,
  tableDisplayName,
  tableSideLabel,
  verifiedUntilLabel,
} from "./format";

// Secondary sections load lazily so the first seat tap only pays for the core detail panel.
// Own Suspense boundary per chunk, so a loading section never blanks the whole panel.
const noFallback = () => null;
const DisputeSection = dynamic(() => import("./DisputeSection").then((m) => m.DisputeSection), { loading: noFallback });
const PhotoVerifyCard = dynamic(() => import("./PhotoVerifyCard").then((m) => m.PhotoVerifyCard), { loading: noFallback });
const TableNameSection = dynamic(() => import("./TableNameSection").then((m) => m.TableNameSection), { loading: noFallback });

export interface SeatDetailProps {
  seat: SeatDto;
  table: TableDto | null;
  me: MeDto | null;
  isMySeat: boolean;
  /** The occupant who chose to be identified for this seat, if any (from `GET /rooms/:id/occupants`). */
  occupant?: SeatOccupantDto | null;
  /** Who marked this seat "Está ocupado" when nobody is checked in (from `GET /rooms/:id/occupants`). */
  markedBy?: { displayName: string; observedAt: string; kind?: "OCCUPIED" | "SAVED" } | null;
  pending: boolean;
  /** True while `getFreshLocation()` is sampling GPS for the in-flight action; swaps in "Buscando tu ubicación…" on the primary buttons below. Optional so callers can adopt it incrementally. */
  locating?: boolean;
  actionError: string | null;
  /** True while the API is waiting for a solved Turnstile challenge to retry the last action. */
  turnstileRequired: boolean;
  onTurnstileToken: (token: string) => void;
  /** Shown only right after a successful "Estoy acá" on this seat; never for observations. */
  onClose: () => void;
  /** `durationMinutes` is how long the user chose to occupy the seat. */
  onCheckIn: (durationMinutes: number) => void;
  onMarkFree: () => void;
  onMarkOccupied: () => void;
  onMarkSaved: () => void;
  onExtend: () => void;
  onCheckOut: () => void;
  /** Viewer-specific detail for `seat.dispute`, or null while it's loading/absent. */
  dispute: SeatDisputeDto | null;
  onOpenDispute: (kind: DisputeKind) => void;
  onVoteDispute: (vote: DisputeVote) => void;
  /** Refetches the room/me snapshot — passed to `PhotoVerifyCard` so a photo result updates the map. */
  onChanged: () => void;
  /** Other identified occupants at the same table (from `GET /rooms/:id/occupants`), for "Personas cercanas". */
  nearbyOccupants?: SeatOccupantDto[];
  /** SVG viewBox width, used to derive "(lado izquierdo/derecho)" for main tables. */
  viewBoxWidth?: number;
  roomId?: string;
  roomSlug?: string;
  /** True right after the viewer marked this seat "Está guardado" — offers to report / ask to free it. */
  showSavedPrompt?: boolean;
  onDismissSavedPrompt?: () => void;
  /** Whether this seat is the viewer's favorite (kept on the device). */
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Free viewer whose one favorite is another seat: the star opens the Pro upsell instead. */
  favoriteNeedsPro?: boolean;
  /** Every seat at this seat's table, for the small locator diagram in the header. */
  tableSeats?: SeatDto[];
  mySeatId?: string | null;
  /** Switch the detail to another seat (tapping a chair in the locator diagram). */
  onSelectSeat?: (seatId: string) => void;
  /** Mobile bottom sheet: a short "peek" layout; table info, nickname and nearby people only when `expanded`. */
  compact?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function SeatDetail({
  seat,
  table,
  me,
  isMySeat,
  occupant,
  markedBy = null,
  pending,
  locating = false,
  actionError,
  turnstileRequired,
  onTurnstileToken,
  onClose,
  onCheckIn,
  onMarkFree,
  onMarkOccupied,
  onMarkSaved,
  onExtend,
  onCheckOut,
  dispute,
  onOpenDispute,
  onVoteDispute,
  onChanged,
  nearbyOccupants = [],
  viewBoxWidth = 1000,
  roomId = "",

  showSavedPrompt = false,
  onDismissSavedPrompt,
  isFavorite = false,
  onToggleFavorite,
  favoriteNeedsPro = false,
  tableSeats = [],
  mySeatId = null,
  onSelectSeat,
  compact = false,
  expanded = false,
  onExpandedChange,
}: SeatDetailProps) {
  const now = useNow(30_000);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pathname = usePathname();
  // Which button was tapped, so only that one swaps to "Buscando…" while the GPS fix is in flight.
  const [tapped, setTapped] = useState<"checkin" | "extend" | "free" | "occupied" | "saved" | null>(null);
  const searching = (action: NonNullable<typeof tapped>) => locating && tapped === action;
  const run = (action: NonNullable<typeof tapped>, fn: () => void) => () => {
    setTapped(action);
    fn();
  };
  // Everyone picks the end time in the dialog; without Pro it can't go past the default block.
  const maxMinutes = maxCheckInMinutes(proLockState(me, false) !== "locked");
  const checkInHint = `hasta las ${clockTimeAfter(DEFAULT_CHECKIN_DURATION, now)}`;
  const locationPrompt = useLocationPrompt(me?.user != null);
  const peek = compact && !expanded;
  const isBar = table?.type === "WALL_BAR";
  const label = seatDisplayLabel(table, seat.code, seat.seatNumber);
  const recency = recencyLabel(seat);
  const side = tableSideLabel(table, viewBoxWidth);
  const myCheckIn = isMySeat ? me?.activeCheckIn ?? null : null;
  const isPhotoVerified =
    myCheckIn?.verificationExpiresAt != null && new Date(myCheckIn.verificationExpiresAt).getTime() > now.getTime();

  const unit = isBar ? "Lugar" : "Asiento";
  const tableLine = [tableDisplayName(table, seat.code), table?.nickname ? `"${table.nickname}"` : null, side].filter(Boolean).join(" · ");
  const facts = [recency, seat.confidence > 0 ? confidenceWording(seat.confidence) : null].filter(Boolean).join(" · ");
  const showMarkedBy = !isMySeat && !occupant && markedBy != null && (seat.status === "OCCUPIED" || (seat.status === "SAVED" && markedBy.kind === "SAVED"));
  const showOccupiedUntil = !isMySeat && seat.status === "OCCUPIED" && seat.occupiedUntil != null;
  const showOccupant = !isMySeat && occupant != null;

  const locationHint = locationPrompt ? (
    <p className="text-center text-xs text-muted">
      Al tocar, tu navegador te va a pedir la ubicación. La usamos sólo para confirmar que estás en la sala; no guardamos tus coordenadas.
    </p>
  ) : null;

  const extras = (
    <>
      {!isBar && table ? <TableNameSection tableId={table.id} loggedIn={me?.user != null} /> : null}

      <NearbyOccupants occupants={nearbyOccupants} />
    </>
  );

  return (
    <div className={`flex h-full flex-col ${compact ? "gap-3 px-4 pb-4 pt-0" : "gap-4 p-4"}`}>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted" title={tableLine}>
          {tableLine}
        </p>
        <div className="-my-2 -mr-2 flex shrink-0 items-center">
          {onToggleFavorite ? (
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-label={isFavorite ? "Quitar de favoritos" : proLabel("Guardar como lugar favorito", favoriteNeedsPro)}
              aria-pressed={isFavorite}
              title={isFavorite ? "Tu lugar favorito" : "Marcar como favorito"}
              className="relative flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-main"
            >
              <StarIcon aria-hidden="true" size={20} weight={isFavorite ? "fill" : "regular"} style={isFavorite ? { color: "var(--seat-saved)" } : undefined} />
              {favoriteNeedsPro && !isFavorite ? <ProBadge /> : null}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-main"
          >
            <XIcon aria-hidden="true" size={20} weight="regular" />
          </button>
        </div>
      </div>
      {actionError ? (
        <p role="alert" className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      ) : null}

      {turnstileRequired ? <TurnstileChallenge onToken={onTurnstileToken} /> : null}


      {showSavedPrompt && !isMySeat && me?.user && onDismissSavedPrompt ? (
        <SavedReportPrompt
          seat={seat}
          roomId={roomId}
          occupant={occupant ?? null}
          seatLabel={label}
          pending={pending}
          onAskToFree={() => {
            onOpenDispute("SAVED");
            onDismissSavedPrompt();
          }}
          onDismiss={onDismissSavedPrompt}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        {!me?.user ? (
          <div className="border-t border-app pt-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-main">
              <EyeIcon aria-hidden="true" size={18} weight="bold" />
              Ingresá para marcar lugares
            </p>
            <p className="mt-1 text-xs text-muted">
              Con tu cuenta podés marcar «Estoy acá» o avisar si un lugar está libre, ocupado o guardado.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent(`${pathname}?seat=${seat.id}`)}`}
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Ingresar
            </Link>
          </div>
        ) : isMySeat ? (
          <>
            <PrimaryButton onClick={run("extend", onExtend)} disabled={pending}>
              {searching("extend") ? "Buscando tu ubicación…" : "Sigo acá"}
            </PrimaryButton>
            <QuietDangerButton onClick={onCheckOut} disabled={pending}>
              Me voy
            </QuietDangerButton>
            {isPhotoVerified && myCheckIn?.verificationExpiresAt ? (
              <p
                className="inline-flex w-fit items-center gap-1.5 rounded-control border border-app px-2.5 py-1 text-xs font-semibold"
                style={{ color: "var(--primary)" }}
              >
                <ShieldCheckIcon aria-hidden="true" size={14} weight="fill" />
                Verificado con foto {verifiedUntilLabel(myCheckIn.verificationExpiresAt)}
              </p>
            ) : myCheckIn?.verifiedAt ? (
              // Protection already expired and this check-in was already verified once — the API
              // rejects a second photo for the same check-in (ALREADY_VERIFIED), so don't offer the
              // button again; a new photo only counts after "Estoy acá" starts a fresh check-in.
              <p className="text-xs text-muted">Ya verificaste este lugar. Para verificar de nuevo, volvé a marcar «Estoy acá».</p>
            ) : myCheckIn ? (
              <PhotoVerifyCard checkInId={myCheckIn.id} onChanged={onChanged} />
            ) : null}
          </>
        ) : (
          <>
            <p className="t-label mt-1">¿Cómo ves este lugar?</p>
            <div className="grid grid-cols-3 gap-2">
              <ObservationChip tone="free" onClick={run("free", onMarkFree)} disabled={pending}>
                {searching("free") ? "Buscando…" : "Está libre"}
              </ObservationChip>
              <ObservationChip tone="occupied" onClick={run("occupied", onMarkOccupied)} disabled={pending}>
                {searching("occupied") ? "Buscando…" : "Está ocupado"}
              </ObservationChip>
              <ObservationChip tone="saved" onClick={run("saved", onMarkSaved)} disabled={pending}>
                {searching("saved") ? "Buscando…" : "Está guardado"}
              </ObservationChip>
            </div>
            <PrimaryButton
              onClick={() => setDialogOpen(true)}
              disabled={pending}
              hint={searching("checkin") ? undefined : checkInHint}
            >
              {searching("checkin") ? "Buscando tu ubicación…" : "Estoy acá"}
            </PrimaryButton>
            {locationHint}
            {canReportLeft(seat) ? (
              <button
                type="button"
                onClick={() => onOpenDispute("SAVED")}
                disabled={pending}
                className="min-h-11 rounded-control border border-app px-3 text-sm font-semibold text-main transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-50"
              >
                Se fue hace más de 30 min
              </button>
            ) : null}
          </>
        )}
      </div>

      {dialogOpen ? (
        <CheckInDialog
          maxMinutes={maxMinutes}
          onCancel={() => setDialogOpen(false)}
          onConfirm={(minutes) => {
            setDialogOpen(false);
            run("checkin", () => onCheckIn(minutes))();
          }}
        />
      ) : null}

      <div className="-mt-1 flex items-center gap-3">
        <div className="shrink-0 rounded-control border border-app p-1.5">
          <TableLocator table={table} seats={tableSeats} selectedSeatId={seat.id} mySeatId={mySeatId} onSelectSeat={onSelectSeat} />
        </div>
        <div className="@container min-w-0 flex-1">
          <h2 className="t-heading text-[clamp(18px,15cqi,26px)]">
            <span className="sr-only">{label}</span>
            <span aria-hidden="true">
              {unit} {seat.seatNumber}
            </span>
          </h2>
          <StatusPill status={seat.status} isMySeat={isMySeat} />
        </div>
      </div>

      {showOccupant || showMarkedBy || showOccupiedUntil || (facts && !peek) ? (
        <div className="-mt-1 flex flex-col divide-y divide-[var(--border)] text-sm text-muted">
          {showOccupant && occupant ? (
            <div className="flex flex-wrap items-center gap-2 py-2">
              {occupant.userId ? (
                <Link href={`/u/${occupant.userId}`} aria-hidden="true" tabIndex={-1} className="shrink-0 rounded-full">
                  <OccupantAvatar avatar={occupant.avatar} size={32} adminBadge={occupant.adminBadge} proBadge={occupant.proBadge} frame={frameOf(occupant.flair)} />
                </Link>
              ) : (
                <OccupantAvatar avatar={occupant.avatar} size={32} adminBadge={occupant.adminBadge} proBadge={occupant.proBadge} frame={frameOf(occupant.flair)} />
              )}
              <span className="min-w-0 flex-1 break-words">
                {occupant.userId ? (
                  <Link href={`/u/${occupant.userId}`} className="font-semibold text-primary hover:underline" style={nameColorStyle(occupant.flair)}>
                    {occupant.displayName}
                  </Link>
                ) : (
                  <span className="font-semibold text-main" style={nameColorStyle(occupant.flair)}>
                    {occupant.displayName}
                  </span>
                )}{" "}
                está acá
              </span>
              {occupant.userId && me?.user && me.user.id !== occupant.userId ? <MessageOccupantButton userId={occupant.userId} /> : null}
            </div>
          ) : null}
          {showMarkedBy && markedBy ? <p className="py-2">{markedByLabel(markedBy.displayName, markedBy.observedAt, now, markedBy.kind)}</p> : null}
          {showOccupiedUntil && seat.occupiedUntil ? <p className="py-2">Ocupado hasta las {clockLabel(seat.occupiedUntil)}</p> : null}
          {facts && !peek ? <p className="py-2 text-[13px]">{facts}</p> : null}
        </div>
      ) : null}


      <DisputeSection
        seat={seat}
        me={me}
        isMySeat={isMySeat}
        dispute={dispute}
        pending={pending}
        onOpen={onOpenDispute}
        onVote={onVoteDispute}
      />

      {compact ? (
        <>
          {expanded ? extras : null}
          <button
            type="button"
            onClick={() => onExpandedChange?.(!expanded)}
            aria-expanded={expanded}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-control text-[13px] font-semibold text-muted active:bg-surface-2"
          >
            {expanded ? "Ver menos" : "Ver más de la mesa"}
            <CaretDownIcon aria-hidden="true" size={14} weight="bold" className={`transition-transform ${expanded ? "" : "rotate-180"}`} />
          </button>
        </>
      ) : (
        extras
      )}
    </div>
  );
}
