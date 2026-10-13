"use client";

export interface DisputeWonBannerProps {
  seatLabel: string;
  pending: boolean;
  onCheckIn: () => void;
  onDismiss: () => void;
}

/**
 * Sticky "you won the vote" prompt for a CLAIM opener (PRD dispute flow). The incumbent's
 * check-in was already cancelled server-side; this just prompts the opener to self-check-in
 * (fresh presence) on the now-free seat. Same non-modal style as `DisputeChallengeBanner`.
 */
export function DisputeWonBanner({ seatLabel, pending, onCheckIn, onDismiss }: DisputeWonBannerProps) {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-control border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="font-medium">
        Ganaste la votación: el lugar quedó libre. <span className="font-normal">({seatLabel})</span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCheckIn}
          disabled={pending}
          className="rounded-control bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          Estoy acá
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={pending}
          className="rounded-control border border-emerald-300 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
