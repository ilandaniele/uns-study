"use client";

import { HandTapIcon, MapPinIcon } from "@phosphor-icons/react/dist/ssr";

/** Right sidebar content when no seat is selected — mirrors the "Tocá un lugar" state in the mockup. */
export function RightPanelEmptyState({ hasActiveCheckIn }: { hasActiveCheckIn: boolean }) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted">
          <HandTapIcon aria-hidden="true" size={24} />
        </span>
        <p className="text-sm text-muted">Tocá un lugar del mapa para ver su estado.</p>
      </div>
      {hasActiveCheckIn ? (
        <div className="flex items-start gap-2 rounded-xl border border-app bg-[var(--surface-2)] p-3">
          <MapPinIcon aria-hidden="true" size={18} className="mt-0.5 shrink-0" style={{ color: "var(--primary)" }} />
          <div>
            <p className="text-sm font-semibold text-main">Estás en la sala</p>
            <p className="text-xs text-muted">Podés actualizar tu lugar desde el mapa.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
