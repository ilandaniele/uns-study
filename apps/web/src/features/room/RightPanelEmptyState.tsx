"use client";

import { HandTapIcon, MapPinIcon } from "@phosphor-icons/react/dist/ssr";

/** Right sidebar content when no seat is selected — mirrors the "Tocá un lugar" state in the mockup. */
export function RightPanelEmptyState({ hasActiveCheckIn }: { hasActiveCheckIn: boolean }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
        <HandTapIcon aria-hidden="true" size={20} className="text-muted" />
        <p className="text-sm text-muted">Tocá un lugar del mapa para ver su estado.</p>
      </div>
      {hasActiveCheckIn ? (
        <div className="flex items-start gap-2 border-t border-app pt-3">
          <MapPinIcon aria-hidden="true" size={18} className="mt-0.5 shrink-0" style={{ color: "var(--primary)" }} />
          <div>
            <p className="text-sm font-semibold text-main">Estás en la sala</p>
            <p className="text-xs text-muted">Tocá tu lugar en el mapa para marcar «Sigo acá» o «Me voy».</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
