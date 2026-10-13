"use client";

export interface AdminPresentBannerProps {
  onDismiss: () => void;
}

/** Room-wide, non-modal notice that an admin/moderator just checked in — never names them (07 §privacy). */
export function AdminPresentBanner({ onDismiss }: AdminPresentBannerProps) {
  return (
    <div role="status" className="flex flex-col gap-2 rounded-control border border-app bg-surface-2 p-3 text-sm text-main sm:flex-row sm:items-center sm:justify-between">
      <p>
        Hay un admin en la sala. <span className="text-muted">Si tenés un problema con un lugar, podés pedir ayuda.</span>
      </p>
      <button type="button" onClick={onDismiss} className="self-start rounded-control border border-app px-3 py-1 text-xs font-semibold text-main hover:bg-surface sm:self-auto">
        Entendido
      </button>
    </div>
  );
}
