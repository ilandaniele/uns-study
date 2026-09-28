"use client";

import { ArmchairIcon } from "@phosphor-icons/react/dist/ssr";

export interface MyCheckInBarProps {
  seatLabel: string;
  expiresAt: string;
  pending: boolean;
  onShow: () => void;
  onRelease: () => void;
}

/**
 * Always-visible reminder of the caller's own check-in with a one-tap "Liberar lugar".
 * Releasing never needs location, so it works after leaving the room (e.g. from home).
 */
export function MyCheckInBar({ seatLabel, expiresAt, pending, onShow, onRelease }: MyCheckInBarProps) {
  const until = new Date(expiresAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-app bg-surface px-4 py-3 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10" style={{ color: "var(--primary)" }}>
        <ArmchairIcon size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-main">Tenés marcado {seatLabel}</p>
        <p className="text-xs text-muted">Hasta las {until}. Si ya te fuiste, liberalo para que otra persona lo use.</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onShow}
          className="min-h-9 rounded-full border border-app px-3 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
        >
          Ver
        </button>
        <button
          type="button"
          onClick={onRelease}
          disabled={pending}
          className="min-h-9 rounded-full bg-primary px-4 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-60"
        >
          Liberar lugar
        </button>
      </div>
    </div>
  );
}
