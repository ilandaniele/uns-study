"use client";

import type { MeDto, SeatDto, SeatOccupantDto, TableDto } from "@uns/contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { IdentityPrompt } from "./IdentityPrompt";
import { TurnstileChallenge } from "./TurnstileChallenge";
import { confidenceWording, recencyLabel, statusLabel } from "./format";

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
  const kind = table?.type === "WALL_BAR" ? "Barra" : "Mesa";
  const recency = recencyLabel(seat);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {kind} {table?.label ?? seat.code} - Asiento {seat.seatNumber}
          </h2>
          <p className="mt-1 text-sm font-medium">
            <StatusDot status={seat.status} isMySeat={isMySeat} /> {isMySeat ? "Tu lugar" : statusLabel(seat.status)}
          </p>
          {!isMySeat && occupant ? (
            <p className="mt-0.5 text-sm text-slate-600">
              <Link href={`/u/${occupant.userId}`} className="font-medium text-primary hover:underline">
                {occupant.displayName}
              </Link>{" "}
              está acá
            </p>
          ) : null}
          {recency ? <p className="text-xs text-slate-500">{recency}</p> : null}
          {seat.confidence > 0 ? (
            <p className="text-xs text-slate-400">{confidenceWording(seat.confidence)}</p>
          ) : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">
          ✕
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
          <p className="text-sm text-slate-600">
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Iniciá sesión
            </Link>{" "}
            para colaborar.
          </p>
        ) : isMySeat ? (
          <>
            <ActionButton primary onClick={onExtend} disabled={pending}>
              Seguir acá
            </ActionButton>
            <ActionButton onClick={onCheckOut} disabled={pending}>
              Me voy
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton primary onClick={onCheckIn} disabled={pending}>
              Estoy acá
            </ActionButton>
            <ActionButton onClick={onMarkFree} disabled={pending}>
              Está libre
            </ActionButton>
            <ActionButton onClick={onMarkOccupied} disabled={pending}>
              Está ocupado
            </ActionButton>
          </>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status, isMySeat }: { status: SeatDto["status"]; isMySeat: boolean }) {
  const color = isMySeat
    ? "#2563eb"
    : { FREE: "#16a34a", OCCUPIED: "#dc2626", UNCERTAIN: "#d97706", UNKNOWN: "#9ca3af" }[status];
  return <span className="inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: color }} aria-hidden />;
}

function ActionButton({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? "rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          : "rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}
