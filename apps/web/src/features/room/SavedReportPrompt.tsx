"use client";

import type { SeatDto, SeatOccupantDto } from "@sala/contracts";
import { FlagIcon, HandPalmIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { canReportLeft } from "./format";

export interface SavedReportPromptProps {
  seat: SeatDto;
  roomId: string;
  /** Whoever is checked in here and chose to be identified; only then can they be reported by name. */
  occupant: SeatOccupantDto | null;
  seatLabel: string;
  pending: boolean;
  onAskToFree: () => void;
  onDismiss: () => void;
}

/**
 * Shown right after the viewer marks a seat "Está guardado": offers to act on it instead of just
 * leaving the mark — ask the room to free it (SAVED dispute vote) and/or report the person holding
 * it, or skip. Reporting only exists for an identified occupant; anonymous holds can still be voted.
 */
export function SavedReportPrompt({ seat, roomId, occupant, seatLabel, pending, onAskToFree, onDismiss }: SavedReportPromptProps) {
  const canAskToFree = canReportLeft(seat);
  const reportHref = occupant?.userId
    ? `/reportar/${occupant.userId}?context=PROFILE&roomId=${encodeURIComponent(roomId)}&reason=SEAT_TROLLING&description=${encodeURIComponent(
        `Guarda el lugar ${seatLabel} sin estar sentado.`,
      )}`
    : null;

  return (
    <section
      aria-label="Lugar marcado como guardado"
      className="rounded-xl border border-[var(--seat-saved)] bg-[var(--surface-2)] p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-main">Listo, avisamos que está guardado.</p>
          <p className="mt-0.5 text-xs text-muted">
            {reportHref ? "¿Querés pedir que lo liberen o reportar a la persona?" : "¿Querés pedir que lo liberen?"}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface)] hover:text-main"
        >
          <XIcon aria-hidden="true" size={16} />
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {reportHref ? (
          <Link
            href={reportHref}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--seat-occupied)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <FlagIcon aria-hidden="true" size={16} weight="bold" />
            Reportar a {occupant?.displayName ?? "la persona"}
          </Link>
        ) : null}
        {canAskToFree ? (
          <button
            type="button"
            onClick={onAskToFree}
            disabled={pending}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-app bg-surface px-3 py-2 text-sm font-semibold text-main hover:border-[var(--border-strong)] disabled:opacity-50"
          >
            <HandPalmIcon aria-hidden="true" size={16} weight="bold" />
            Pedir que lo liberen
          </button>
        ) : null}
        <button type="button" onClick={onDismiss} className="min-h-10 rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-main">
          Solo reportar
        </button>
      </div>
    </section>
  );
}
