"use client";

import { useAutoExtendEnabled } from "@/features/auto-extend/useAutoExtendPrefs";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { ProBadge } from "@/features/subscriptions/ProBadge";
import { usePro } from "@/features/subscriptions/usePro";

export interface ExtendBannerProps {
  minutesLeft: number;
  pending: boolean;
  onExtend: () => void;
  onCheckOut: () => void;
  /** True while GPS is being sampled for the extend request. */
  locating?: boolean;
}

/**
 * Non-modal "¿Seguís acá?" prompt (PRD §7), shown at the top of the room page while the
 * caller's active check-in has 5 minutes or less remaining.
 */
export function ExtendBanner({ minutesLeft, pending, onExtend, onCheckOut, locating = false }: ExtendBannerProps) {
  const { lock } = usePro();
  const [autoExtend] = useAutoExtendEnabled();
  const autoActive = autoExtend && lock === "unlocked";
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-control border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-medium">¿Seguís acá? Tu lugar se libera en {minutesLeft} min.</p>
        {autoActive ? <p className="text-xs">Sigo acá automático activo: lo intentamos con tu ubicación mientras tengas la app abierta.</p> : null}
        {lock === "locked" ? (
          <button type="button" onClick={() => openProUpsell("auto_extend")} className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold underline">
            Renovalo solo con Sigo acá automático
            <ProBadge inline />
          </button>
        ) : null}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onExtend}
          disabled={pending}
          className="rounded-control bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {locating ? "Buscando tu ubicación…" : "Sigo acá"}
        </button>
        <button
          type="button"
          onClick={onCheckOut}
          disabled={pending}
          className="rounded-control border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          Me voy
        </button>
      </div>
    </div>
  );
}
