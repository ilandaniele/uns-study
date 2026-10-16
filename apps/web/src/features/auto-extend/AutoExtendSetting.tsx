"use client";

import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { usePro } from "@/features/subscriptions/usePro";
import { useAutoExtendEnabled } from "./useAutoExtendPrefs";

const LABEL = "Renovar 'Sigo acá' automáticamente si estoy en la sala";

/** Pro: per-device switch for the automatic "Sigo acá" (see `AutoExtendRuntime`). */
export function AutoExtendSetting() {
  const { lock } = usePro();
  const [enabled, setEnabled] = useAutoExtendEnabled();
  if (lock === "unknown") return null;
  const locked = lock === "locked";
  const on = enabled && !locked;

  return (
    <div className="mb-4 flex items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium text-main">{LABEL}</span>
        <span className="block text-xs text-muted">
          Cuando falten 15 minutos o menos, usamos tu ubicación para renovar tu lugar. Solo funciona con la app abierta y estando dentro de la sala. Si no
          alcanza, te avisamos como siempre.
        </span>
        {locked ? (
          <button type="button" onClick={() => openProUpsell("auto_extend")} className="mt-1 text-xs font-semibold text-primary hover:underline">
            Es una función Pro: ver Sala de Estudio Pro
          </button>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={LABEL}
        onClick={() => (locked ? openProUpsell("auto_extend") : setEnabled(!enabled))}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border border-app transition-colors before:absolute before:-inset-y-2.5 before:-inset-x-1 before:content-[''] ${
          on ? "bg-primary" : "bg-surface-2"
        }`}
      >
        <span
          aria-hidden
          className={`absolute left-0 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
