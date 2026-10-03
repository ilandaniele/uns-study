"use client";

export interface CancelSubscriptionDialogProps {
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirm step before cancelling the ad-free subscription (same shell as `MoveSeatDialog`). */
export function CancelSubscriptionDialog({ pending, onConfirm, onCancel }: CancelSubscriptionDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-subscription-title"
        className="w-full max-w-sm rounded-t-2xl border border-app bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cancel-subscription-title" className="font-display text-lg font-semibold text-main">
          ¿Cancelar la suscripción?
        </h2>
        <p className="mt-1 text-sm text-muted">Vas a volver a ver anuncios y no se te va a cobrar más.</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-60"
          >
            Sí, cancelar suscripción
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-app px-4 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
          >
            Volver
          </button>
        </div>
      </div>
    </div>
  );
}
