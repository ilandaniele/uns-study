"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CHECKIN_PRO_MAX_MINUTES } from "@sala/contracts/events";
import { ProBadge } from "@/features/subscriptions/ProBadge";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { checkInChoice, chipsUpTo, clockTimeAfter } from "./checkin-duration";
import { durationLabel } from "./SeatDetailParts";

export interface CheckInDialogProps {
  /** Longest stay this user may pick (180 without Pro, 720 with it). */
  maxMinutes: number;
  onConfirm: (durationMinutes: number) => void;
  onCancel: () => void;
}

/** "¿Hasta qué hora te quedás?" — the end-time step between tapping "Estoy acá" and the check-in itself. */
export function CheckInDialog({ maxMinutes, onConfirm, onCancel }: CheckInDialogProps) {
  // Starts empty on purpose: the user must say until what time they stay before checking in.
  const [time, setTime] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { onEscape: onCancel });

  // Read against the clock at render and confirm time, so a dialog left open can't drift past the limit.
  const choice = checkInChoice(time, new Date(), maxMinutes);
  const picked = time !== "";
  const showError = picked && !choice.ok;
  const isPro = maxMinutes >= CHECKIN_PRO_MAX_MINUTES;
  const chips = chipsUpTo(maxMinutes);
  const choiceMinutes = choice.ok ? choice.minutes : null;

  const submit = () => {
    const fresh = checkInChoice(time, new Date(), maxMinutes);
    if (fresh.ok) onConfirm(fresh.minutes);
  };

  return createPortal(
    <div
      className="backdrop-enter fixed inset-0 z-[65] flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkin-dialog-title"
        tabIndex={-1}
        className="dialog-enter w-full rounded-t-2xl border border-app bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5 shadow-xl outline-none sm:max-w-sm sm:rounded-2xl sm:pb-5"
      >
        <h2 id="checkin-dialog-title" className="text-lg font-semibold text-main">
          ¿Hasta qué hora te quedás?
        </h2>
        <div role="group" aria-label="Duraciones rápidas" className="mt-4 flex gap-2">
          {chips.map((chip) => (
            <button
              key={chip.minutes}
              type="button"
              aria-pressed={choiceMinutes === chip.minutes}
              onClick={() => setTime(clockTimeAfter(chip.minutes, new Date()))}
              className={`min-h-11 flex-1 rounded-control border px-1 text-sm font-semibold tabular-nums transition-colors ${
                choiceMinutes === chip.minutes ? "border-[var(--border-strong)] bg-surface-2 text-main" : "border-app text-muted hover:text-main"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
          Hora de salida
          <input
            type="time"
            value={time}
            required
            aria-invalid={showError ? true : undefined}
            aria-describedby="checkin-dialog-summary"
            onChange={(e) => setTime(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className="min-h-11 rounded-control border border-app bg-transparent px-2 text-base text-main"
          />
        </label>
        <p id="checkin-dialog-summary" role={showError ? "alert" : undefined} className={`mt-2 text-sm ${showError ? "font-semibold text-red-600" : "text-muted"}`}>
          {!picked
            ? "Elegí hasta qué hora te quedás para marcar el lugar."
            : choice.ok
              ? `${durationLabel(choice.minutes)} · hasta las ${clockTimeAfter(choice.minutes, new Date())}`
              : choice.message}
        </p>
        {!isPro ? (
          <button
            type="button"
            onClick={() => {
              onCancel();
              openProUpsell("checkin_duration");
            }}
            className="mt-1 inline-flex min-h-11 w-fit items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            Elegir hasta 12 h
            <ProBadge inline />
          </button>
        ) : null}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-control border border-app px-4 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!choice.ok}
            className="min-h-11 rounded-control bg-primary px-4 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-50"
          >
            Estoy acá
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
