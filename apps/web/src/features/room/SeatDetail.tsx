"use client";

import type { DisputeKind, DisputeVote, MeDto, SeatDisputeDto, SeatDto, SeatOccupantDto, TableDto } from "@uns/contracts";
import { ArmchairIcon, ChairIcon, ShieldCheckIcon, TableIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MessageOccupantButton } from "./MessageOccupantButton";
import { useState, type ReactNode } from "react";
import { CheckInDurationPicker } from "./CheckInDurationPicker";
import { clockLabel, DEFAULT_CHECKIN_DURATION } from "./checkin-duration";
import { IdentityPrompt } from "./IdentityPrompt";
import { NearbyOccupants } from "./NearbyOccupants";
import { OccupantAvatar } from "./OccupantAvatar";
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
  markedBy?: { displayName: string; observedAt: string } | null;
  pending: boolean;
  /** True while `getFreshLocation()` is sampling GPS for the in-flight action; swaps in "Buscando tu ubicación…" on the primary buttons below. Optional so callers can adopt it incrementally. */
  locating?: boolean;
  actionError: string | null;
  /** True while the API is waiting for a solved Turnstile challenge to retry the last action. */
  turnstileRequired: boolean;
  onTurnstileToken: (token: string) => void;
  /** Shown only right after a successful "Estoy acá" on this seat; never for observations. */
  showIdentityPrompt: boolean;
  onIdentityChoice: (showIdentity: boolean) => void;
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
  showIdentityPrompt,
  onIdentityChoice,
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
}: SeatDetailProps) {
  const now = useNow(30_000);
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_CHECKIN_DURATION);
  const isBar = table?.type === "WALL_BAR";
  const label = seatDisplayLabel(table, seat.code, seat.seatNumber);
  const recency = recencyLabel(seat);
  const side = tableSideLabel(table, viewBoxWidth);
  const myCheckIn = isMySeat ? me?.activeCheckIn ?? null : null;
  const isPhotoVerified =
    myCheckIn?.verificationExpiresAt != null && new Date(myCheckIn.verificationExpiresAt).getTime() > now.getTime();

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold tracking-tight text-main">{label}</p>
          <StatusPill status={seat.status} isMySeat={isMySeat} />
          {!isMySeat && occupant ? (
            <p className="mt-1.5 flex items-center gap-2 text-sm text-muted">
              <OccupantAvatar avatar={occupant.avatar} size={40} />
              <span>
                {occupant.userId ? (
                  <Link href={`/u/${occupant.userId}`} className="font-medium text-primary hover:underline">
                    {occupant.displayName}
                  </Link>
                ) : (
                  <span className="font-medium text-main">{occupant.displayName}</span>
                )}{" "}
                está acá
              </span>
            </p>
          ) : null}
          {!isMySeat && occupant?.userId && me?.user && me.user.id !== occupant.userId ? <MessageOccupantButton userId={occupant.userId} /> : null}
          {!isMySeat && !occupant && markedBy && seat.status === "OCCUPIED" ? (
            <p className="mt-1.5 text-sm text-muted">{markedByLabel(markedBy.displayName, markedBy.observedAt, now)}</p>
          ) : null}
          {!isMySeat && seat.status === "OCCUPIED" && seat.occupiedUntil ? (
            <p className="mt-1.5 text-sm text-muted">Ocupado hasta las {clockLabel(seat.occupiedUntil)}</p>
          ) : null}
          {recency ? <p className="mt-1 text-sm text-muted">{recency}</p> : null}
          {seat.confidence > 0 ? (
            <p className="text-sm text-muted" style={{ opacity: 0.75 }}>
              {confidenceWording(seat.confidence)}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--surface-2)] hover:text-main"
        >
          <XIcon aria-hidden="true" size={20} weight="regular" />
        </button>
      </div>

      {actionError ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      ) : null}

      {turnstileRequired ? <TurnstileChallenge onToken={onTurnstileToken} /> : null}

      {isMySeat && showIdentityPrompt ? <IdentityPrompt onChoose={onIdentityChoice} /> : null}

      <div className="flex flex-col gap-2">
        {!me?.user ? (
          <p className="text-sm text-muted">
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Iniciá sesión
            </Link>{" "}
            para colaborar.
          </p>
        ) : isMySeat ? (
          <>
            <PrimaryButton onClick={onExtend} disabled={pending}>
              {locating ? "Buscando tu ubicación…" : "Seguir acá"}
            </PrimaryButton>
            <QuietDangerButton onClick={onCheckOut} disabled={pending}>
              Me voy
            </QuietDangerButton>
            {isPhotoVerified && myCheckIn?.verificationExpiresAt ? (
              <p
                className="inline-flex w-fit items-center gap-1.5 rounded-full border border-app px-2.5 py-1 text-xs font-semibold"
                style={{ color: "var(--primary)" }}
              >
                <ShieldCheckIcon aria-hidden="true" size={14} weight="fill" />
                Verificado con foto {verifiedUntilLabel(myCheckIn.verificationExpiresAt)}
              </p>
            ) : myCheckIn?.verifiedAt ? (
              // Protection already expired and this check-in was already verified once — the API
              // rejects a second photo for the same check-in (ALREADY_VERIFIED), so don't offer the
              // button again; a new photo only counts after "Estoy acá" starts a fresh check-in.
              <p className="text-xs text-muted">Ya verificaste este lugar en este check-in.</p>
            ) : myCheckIn ? (
              <PhotoVerifyCard checkInId={myCheckIn.id} onChanged={onChanged} />
            ) : null}
          </>
        ) : (
          <>
            <CheckInDurationPicker minutes={durationMinutes} onChange={setDurationMinutes} disabled={pending} now={now} />
            <PrimaryButton onClick={() => onCheckIn(durationMinutes)} disabled={pending}>
              {locating ? "Buscando tu ubicación…" : "Estoy acá"}
            </PrimaryButton>
            <div className="flex flex-wrap gap-2">
              <OutlineButton tone="free" onClick={onMarkFree} disabled={pending}>
                {locating ? "Buscando tu ubicación…" : "Está libre"}
              </OutlineButton>
              <OutlineButton tone="occupied" onClick={onMarkOccupied} disabled={pending}>
                {locating ? "Buscando tu ubicación…" : "Está ocupado"}
              </OutlineButton>
              <OutlineButton tone="saved" onClick={onMarkSaved} disabled={pending}>
                {locating ? "Buscando tu ubicación…" : "Está guardado"}
              </OutlineButton>
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

      <div className="border-t border-app pt-3">
        <h2 className="text-sm font-semibold text-main">Información</h2>
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
    </div>
  );
}

function StatusPill({ status, isMySeat }: { status: SeatDto["status"]; isMySeat: boolean }) {
  const color = isMySeat
    ? "var(--seat-mine)"
    : { FREE: "var(--seat-free)", OCCUPIED: "var(--seat-occupied)", UNCERTAIN: "var(--seat-uncertain)", SAVED: "var(--seat-saved)", UNKNOWN: "var(--seat-unknown)" }[
        status
      ];
  return (
    <p
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-app px-2.5 py-1 text-xs font-semibold"
      style={{ color }}
    >
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {isMySeat ? "Tu lugar" : statusLabel(status)}
    </p>
  );
}

function PrimaryButton({
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
      className="min-h-11 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function OutlineButton({
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
      style={{ borderColor: color, color }}
      className="min-h-11 min-w-[6.5rem] flex-1 rounded-xl border-2 bg-transparent px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
    >
      {children}
    </button>
  );
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
      className="min-h-11 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--seat-occupied)] hover:bg-[var(--surface-2)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}
