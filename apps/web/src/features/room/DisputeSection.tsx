"use client";

import type { DisputeKind, DisputeVote, MeDto, SeatDisputeDto, SeatDto } from "@uns/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { disputeCountdownLabel, disputeKindTitle, disputeOptionsFor } from "./format";

export interface DisputeSectionProps {
  seat: SeatDto;
  me: MeDto | null;
  isMySeat: boolean;
  /** Viewer-specific detail for `seat.dispute`, or null while it's loading/absent. */
  dispute: SeatDisputeDto | null;
  pending: boolean;
  onOpen: (kind: DisputeKind) => void;
  onVote: (vote: DisputeVote) => void;
}

/**
 * "¿Algo no cuadra?" — lets a logged-in visitor dispute an occupied/uncertain seat that isn't
 * theirs (open a vote), or shows the live tally + vote buttons while a vote is in progress.
 */
export function DisputeSection({ seat, me, isMySeat, dispute, pending, onOpen, onVote }: DisputeSectionProps) {
  if (!me?.user || isMySeat) return null;
  if (seat.status !== "OCCUPIED" && seat.status !== "UNCERTAIN") return null;

  if (seat.dispute) {
    // Viewer-specific detail hasn't loaded yet — avoid flashing the "¿Algo no cuadra?" options.
    if (!dispute) return null;
    return <ActiveDispute dispute={dispute} me={me} pending={pending} onVote={onVote} />;
  }

  const options = disputeOptionsFor(seat);
  if (options.length === 0) return null;

  return (
    <div className="border-t border-app pt-3">
      <h2 className="text-sm font-semibold text-main">¿Algo no cuadra?</h2>
      <div className="mt-2 flex flex-col gap-2">
        {options.map((option) => (
          <button
            key={option.kind}
            type="button"
            onClick={() => onOpen(option.kind)}
            disabled={pending}
            className="rounded-xl border border-app bg-transparent px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            <span className="block font-semibold text-main">{option.label}</span>
            <span className="block text-xs text-muted">{option.helper}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveDispute({
  dispute,
  me,
  pending,
  onVote,
}: {
  dispute: SeatDisputeDto;
  me: MeDto | null;
  pending: boolean;
  onVote: (vote: DisputeVote) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const canVote = me?.activeCheckIn != null;

  return (
    <div role="status" className="border-t border-app pt-3">
      <h2 className="text-sm font-semibold text-main">{disputeKindTitle(dispute.kind)}</h2>
      <p className="mt-1 text-sm text-muted">Se decide en {disputeCountdownLabel(dispute.closesAt, now)}</p>
      <p className="mt-1 text-sm text-muted">
        Está ahí: {dispute.votes.present} · No está: {dispute.votes.absent}
      </p>
      {dispute.iAmOpener ? (
        <p className="mt-2 text-sm text-muted">Abriste esta votación.</p>
      ) : dispute.myVote ? (
        <p className="mt-2 text-sm text-muted">Votaste: {dispute.myVote === "PRESENT" ? "Está ahí" : "No está"}</p>
      ) : dispute.iAmIncumbent ? null : !canVote ? (
        <p className="mt-2 text-sm text-muted">Marcá tu lugar para votar.</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <VoteButton onClick={() => onVote("PRESENT")} disabled={pending}>
            Está ahí
          </VoteButton>
          <VoteButton onClick={() => onVote("ABSENT")} disabled={pending}>
            No está
          </VoteButton>
        </div>
      )}
    </div>
  );
}

function VoteButton({
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
      className="min-h-11 flex-1 rounded-xl border-2 border-app bg-transparent px-3 py-2.5 text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}
