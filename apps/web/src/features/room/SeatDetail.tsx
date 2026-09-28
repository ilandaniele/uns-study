"use client";

import type { MeDto, SeatDto, SeatOccupantDto, TableDto } from "@uns/contracts";
import { ArmchairIcon, ChairIcon, TableIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { IdentityPrompt } from "./IdentityPrompt";
import { TurnstileChallenge } from "./TurnstileChallenge";
import { confidenceWording, recencyLabel, seatDisplayLabel, statusLabel, tableDisplayName } from "./format";

export interface SeatDetailProps {
  seat: SeatDto;
  table: TableDto | null;
  me: MeDto | null;
  isMySeat: boolean;
  /** The occupant who chose to be identified for this seat, if any (from `GET /rooms/:id/occupants`). */
  occupant?: SeatOccupantDto | null;
  pending: boolean;
  actionError: string | null;
  /** True while the API is waiting for a solved Turnstile challenge to retry the last action. */
  turnstileRequired: boolean;
  onTurnstileToken: (token: string) => void;
  /** Shown only right after a successful "Estoy acá" on this seat; never for observations. */
  showIdentityPrompt: boolean;
  onIdentityChoice: (showIdentity: boolean) => void;
  onClose: () => void;
  onCheckIn: () => void;
  onMarkFree: () => void;
  onMarkOccupied: () => void;
  onExtend: () => void;
  onCheckOut: () => void;
}

export function SeatDetail({
  seat,
  table,
  me,
  isMySeat,
  occupant,
  pending,
  actionError,
  turnstileRequired,
  onTurnstileToken,
  showIdentityPrompt,
  onIdentityChoice,
  onClose,
  onCheckIn,
  onMarkFree,
  onMarkOccupied,
  onExtend,
  onCheckOut,
}: SeatDetailProps) {
  const isBar = table?.type === "WALL_BAR";
  const label = seatDisplayLabel(table, seat.code, seat.seatNumber);
  const recency = recencyLabel(seat);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold tracking-tight text-main">{label}</p>
          <StatusPill status={seat.status} isMySeat={isMySeat} />
          {!isMySeat && occupant ? (
            <p className="mt-1.5 text-sm text-muted">
              <Link href={`/u/${occupant.userId}`} className="font-medium text-primary hover:underline">
                {occupant.displayName}
              </Link>{" "}
              está acá
            </p>
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
              Seguir acá
            </PrimaryButton>
            <QuietDangerButton onClick={onCheckOut} disabled={pending}>
              Me voy
            </QuietDangerButton>
          </>
        ) : (
          <>
            <PrimaryButton onClick={onCheckIn} disabled={pending}>
              Estoy acá
            </PrimaryButton>
            <div className="flex gap-2">
              <OutlineButton tone="free" onClick={onMarkFree} disabled={pending}>
                Está libre
              </OutlineButton>
              <OutlineButton tone="occupied" onClick={onMarkOccupied} disabled={pending}>
                Está ocupado
              </OutlineButton>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-app pt-3">
        <h2 className="text-sm font-semibold text-main">Información</h2>
        <ul className="mt-2 flex flex-col gap-2 text-sm text-muted">
          <li className="flex items-center gap-2">
            <TableIcon aria-hidden="true" size={18} />
            {tableDisplayName(table, seat.code)}
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
    </div>
  );
}

function StatusPill({ status, isMySeat }: { status: SeatDto["status"]; isMySeat: boolean }) {
  const color = isMySeat
    ? "var(--seat-mine)"
    : { FREE: "var(--seat-free)", OCCUPIED: "var(--seat-occupied)", UNCERTAIN: "var(--seat-uncertain)", UNKNOWN: "var(--seat-unknown)" }[
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
  tone: "free" | "occupied";
}) {
  const color = tone === "free" ? "var(--seat-free)" : "var(--seat-occupied)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ borderColor: color, color }}
      className="min-h-11 flex-1 rounded-xl border-2 bg-transparent px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
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
