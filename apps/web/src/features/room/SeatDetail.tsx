"use client";

import type { DisputeKind, DisputeVote, MeDto, SeatDisputeDto, SeatDto, SeatOccupantDto, TableDto } from "@sala/contracts";
import { ArmchairIcon, CaretDownIcon, ChairIcon, EyeIcon, ShieldCheckIcon, StarIcon, TableIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageOccupantButton } from "./MessageOccupantButton";
import { useEffect, useState, type ReactNode } from "react";
import { CheckInDurationPicker } from "./CheckInDurationPicker";
import { clockLabel, clockTimeAfter, DEFAULT_CHECKIN_DURATION } from "./checkin-duration";
import { NearbyOccupants } from "./NearbyOccupants";
import { OccupantAvatar } from "./OccupantAvatar";
import { SavedReportPrompt } from "./SavedReportPrompt";
import { TableLocator } from "./TableLocator";
import { markedByLabel } from "./seat-avatar";
import { TurnstileChallenge } from "./TurnstileChallenge";
import { useNow } from "@/lib/use-now";
import {
  confidenceWording,
  recencyLabel,
  seatDisplayLabel,
  statusLabel,
  tableDisplayName,
  tableSideLabel,
  verifiedUntilLabel,
} from "./format";

// Secondary sections load lazily so the first seat tap only pays for the core detail panel.
const DisputeSection = dynamic(() => import("./DisputeSection").then((m) => m.DisputeSection));
const PhotoVerifyCard = dynamic(() => import("./PhotoVerifyCard").then((m) => m.PhotoVerifyCard));
const TableNameSection = dynamic(() => import("./TableNameSection").then((m) => m.TableNameSection));

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
  /** True right after the viewer marked this seat "Está guardado" — offers to report / ask to free it. */
  showSavedPrompt?: boolean;
  onDismissSavedPrompt?: () => void;
  /** Whether this seat is the viewer's favorite (kept on the device). */
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
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
  tableSeats = [],
  mySeatId = null,
  onSelectSeat,
  compact = false,
  expanded = false,
  onExpandedChange,
}: SeatDetailProps) {
  const now = useNow(30_000);
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_CHECKIN_DURATION);
  const [showPicker, setShowPicker] = useState(false);
  const pathname = usePathname();
  // Which button was tapped, so only that one swaps to "Buscando…" while the GPS fix is in flight.
  const [tapped, setTapped] = useState<"checkin" | "extend" | "free" | "occupied" | "saved" | null>(null);
  const searching = (action: NonNullable<typeof tapped>) => locating && tapped === action;
  const run = (action: NonNullable<typeof tapped>, fn: () => void) => () => {
    setTapped(action);
    fn();
  };
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
      <div className="border-t border-app pt-3">
        <h3 className="label-caps text-muted">Información</h3>
        <ul className="mt-2 flex flex-col gap-2 text-sm text-muted">
          <li className="flex items-center gap-2">
            <TableIcon aria-hidden="true" size={18} />
            {tableDisplayName(table, seat.code)}
            {table?.nickname ? ` · "${table.nickname}"` : ""}
            {side ? ` (${side})` : ""}
          </li>
          <li className="flex items-center gap-2">
            <ChairIcon aria-hidden="true" size={18} />
            {isBar ? `Lugar ${seat.seatNumber} de 3` : `Asiento ${seat.seatNumber} de 8`}
          </li>
          <li className="flex items-center gap-2">
            <ArmchairIcon aria-hidden="true" size={18} />
            Tipo: {isBar ? "Barra" : "Mesa principal"}
          </li>
        </ul>
      </div>

      {!isBar && table ? <TableNameSection tableId={table.id} loggedIn={me?.user != null} /> : null}

      <NearbyOccupants occupants={nearbyOccupants} />
    </>
  );

  return (
    <div className={`flex h-full flex-col ${compact ? "gap-3 px-4 pb-4 pt-0" : "gap-4 p-4"}`}>
      <div className="flex items-center gap-2">
        <p className="label-caps min-w-0 flex-1 truncate text-muted" title={tableLine}>
          {tableLine}
        </p>
        <div className="-my-2 -mr-2 flex shrink-0 items-center">
          {onToggleFavorite ? (
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-label={isFavorite ? "Quitar de favoritos" : "Guardar como lugar favorito"}
              aria-pressed={isFavorite}
              title={isFavorite ? "Tu lugar favorito" : "Marcar como favorito"}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-2)] hover:text-main"
            >
              <StarIcon aria-hidden="true" size={20} weight={isFavorite ? "fill" : "regular"} style={isFavorite ? { color: "var(--seat-saved)" } : undefined} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-2)] hover:text-main"
          >
            <XIcon aria-hidden="true" size={20} weight="regular" />
          </button>
        </div>
      </div>
      <div className="-mt-1 flex items-center gap-3">
        <div className="shrink-0 rounded-xl bg-[var(--surface-2)] p-1.5">
          <TableLocator table={table} seats={tableSeats} selectedSeatId={seat.id} mySeatId={mySeatId} onSelectSeat={onSelectSeat} />
        </div>
        <div className="@container min-w-0 flex-1">
          <h2 className="font-display text-[clamp(18px,15cqi,26px)] font-extrabold uppercase leading-none text-main">
            <span className="sr-only">{label}</span>
            <span aria-hidden="true">
              {unit} {seat.seatNumber}
            </span>
          </h2>
          <StatusPill status={seat.status} isMySeat={isMySeat} />
        </div>
      </div>

      {showOccupant || showMarkedBy || showOccupiedUntil || (facts && !peek) ? (
        <div className="-mt-1 flex flex-col gap-1 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm text-muted">
          {showOccupant && occupant ? (
            <div className="flex flex-wrap items-center gap-2">
              <OccupantAvatar avatar={occupant.avatar} size={32} adminBadge={occupant.adminBadge} />
              <span className="min-w-0 flex-1 break-words">
                {occupant.userId ? (
                  <Link href={`/u/${occupant.userId}`} className="font-semibold text-primary hover:underline">
                    {occupant.displayName}
                  </Link>
                ) : (
                  <span className="font-semibold text-main">{occupant.displayName}</span>
                )}{" "}
                está acá
              </span>
              {occupant.userId && me?.user && me.user.id !== occupant.userId ? <MessageOccupantButton userId={occupant.userId} /> : null}
            </div>
          ) : null}
          {showMarkedBy && markedBy ? <p>{markedByLabel(markedBy.displayName, markedBy.observedAt, now, markedBy.kind)}</p> : null}
          {showOccupiedUntil && seat.occupiedUntil ? <p>Ocupado hasta las {clockLabel(seat.occupiedUntil)}</p> : null}
          {facts && !peek ? <p className="text-[13px]">{facts}</p> : null}
        </div>
      ) : null}

      {actionError ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
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
          <div className="rounded-xl border border-app bg-[var(--surface-2)] p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-main">
              <EyeIcon aria-hidden="true" size={18} weight="bold" />
              Ingresá para marcar lugares
            </p>
            <p className="mt-1 text-xs text-muted">
              Con tu cuenta podés marcar «Estoy acá» o avisar si un lugar está libre, ocupado o guardado.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent(`${pathname}?seat=${seat.id}`)}`}
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
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
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-app px-2.5 py-1 text-xs font-semibold"
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
            {compact ? (
              <>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <PrimaryButton
                      onClick={run("checkin", () => onCheckIn(durationMinutes))}
                      disabled={pending}
                      hint={searching("checkin") ? undefined : `hasta las ${clockTimeAfter(durationMinutes, now)}`}
                    >
                      {searching("checkin") ? "Buscando tu ubicación…" : "Estoy acá"}
                    </PrimaryButton>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPicker((value) => !value)}
                    aria-expanded={showPicker}
                    aria-label={`Duración: ${durationLabel(durationMinutes)}. Cambiar`}
                    className="flex min-h-[52px] shrink-0 items-center gap-1 rounded-2xl bg-[var(--surface-2)] px-3.5 text-sm font-bold tabular-nums text-main transition-transform duration-150 ease-out active:scale-[0.97]"
                  >
                    {durationLabel(durationMinutes)}
                    <CaretDownIcon aria-hidden="true" size={14} weight="bold" className={`transition-transform ${showPicker ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {locationHint}
                {showPicker ? <CheckInDurationPicker minutes={durationMinutes} onChange={setDurationMinutes} disabled={pending} now={now} /> : null}
              </>
            ) : (
              <>
                <CheckInDurationPicker minutes={durationMinutes} onChange={setDurationMinutes} disabled={pending} now={now} />
                <PrimaryButton
                  onClick={run("checkin", () => onCheckIn(durationMinutes))}
                  disabled={pending}
                  hint={searching("checkin") ? undefined : `hasta las ${clockTimeAfter(durationMinutes, now)}`}
                >
                  {searching("checkin") ? "Buscando tu ubicación…" : "Estoy acá"}
                </PrimaryButton>
                {locationHint}
              </>
            )}
            <p className="label-caps mt-1 text-muted">¿Cómo ves este lugar?</p>
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
          </>
        )}
      </div>

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
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-muted active:bg-[var(--surface-2)]"
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

/** True while the browser would still ask for geolocation (permission state "prompt") and the viewer is logged in. */
function useLocationPrompt(enabled: boolean): boolean {
  const [prompt, setPrompt] = useState(false);
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const sync = () => setPrompt(status?.state === "prompt");
    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (cancelled) return;
        status = result;
        sync();
        result.addEventListener("change", sync);
      })
      .catch(() => {
        // Unsupported (e.g. older Safari): no priming line.
      });
    return () => {
      cancelled = true;
      status?.removeEventListener("change", sync);
    };
  }, [enabled]);
  return enabled && prompt;
}

function StatusPill({ status, isMySeat }: { status: SeatDto["status"]; isMySeat: boolean }) {
  const color = isMySeat
    ? "var(--seat-mine)"
    : { FREE: "var(--seat-free)", OCCUPIED: "var(--seat-occupied)", UNCERTAIN: "var(--seat-uncertain)", SAVED: "var(--seat-saved)", UNKNOWN: "var(--seat-unknown)" }[
        status
      ];
  return (
    <p className="mt-2 flex items-center gap-2 whitespace-nowrap text-sm font-bold text-main">
      <span aria-hidden className="inline-block h-3 w-3 rounded-[3px]" style={{ backgroundColor: color }} />
      {isMySeat ? "Tu lugar" : statusLabel(status)}
    </p>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  hint,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Small secondary text inside the button (e.g. "hasta las 18:40"). */
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-base font-bold text-white transition-[background-color,transform] hover:bg-primary-dark active:scale-[0.98] disabled:opacity-50"
    >
      {children}
      {hint ? <span className="text-[13px] font-medium tabular-nums text-white/85 max-[359px]:hidden">· {hint}</span> : null}
    </button>
  );
}

function ObservationChip({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: "free" | "occupied" | "saved";
}) {
  const color = { free: "var(--seat-free)", occupied: "var(--seat-occupied)", saved: "var(--seat-saved)" }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-2xl bg-[var(--surface-2)] px-1 text-center text-[13px] font-semibold leading-tight [text-wrap:balance] text-main transition-transform active:scale-[0.96] disabled:opacity-50"
    >
      {/* Status color lives in the dot, not the text, so every label keeps full contrast. */}
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </button>
  );
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${Math.floor(hours)} h ${minutes % 60}`;
}

function QuietDangerButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-[var(--seat-occupied)] hover:bg-[var(--surface-2)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}
