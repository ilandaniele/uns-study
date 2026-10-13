"use client";

import { useState } from "react";
import { CHECKIN_MINUTES, CHECKIN_MIN_MINUTES } from "@sala/contracts/events";
import { CHECKIN_DURATION_CHIPS, clockTimeAfter, rawMinutesUntilClockTime } from "./checkin-duration";

export interface CheckInDurationPickerProps {
  /** Currently chosen duration in minutes. */
  minutes: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
  now: Date;
}

/** Segmented "[30 min] [1 h] [2 h] [3 h] [Otra hora]" — how long the user will occupy the seat. */
export function CheckInDurationPicker({ minutes, onChange, disabled = false, now }: CheckInDurationPickerProps) {
  /** Label of the confirmed custom end time ("Hasta las 18:30"); null while a preset is selected. */
  const [customLabel, setCustomLabel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chipActive = (value: number) => customLabel === null && !open && minutes === value;

  const openPanel = () => {
    setDraft(clockTimeAfter(minutes, now));
    setError(null);
    setOpen(true);
  };

  const confirm = () => {
    const raw = rawMinutesUntilClockTime(draft, new Date());
    const from = new Date();
    if (raw === null || raw < CHECKIN_MIN_MINUTES || raw > CHECKIN_MINUTES) {
      setError(`Elegí una hora entre las ${clockTimeAfter(CHECKIN_MIN_MINUTES, from)} y las ${clockTimeAfter(CHECKIN_MINUTES, from)}`);
      return;
    }
    const chosen = Math.round(raw);
    setCustomLabel(`Hasta las ${clockTimeAfter(chosen, from)}`);
    setError(null);
    setOpen(false);
    onChange(chosen);
  };

  const cancel = () => {
    setError(null);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Hasta cuándo vas a ocupar el lugar" className="flex items-stretch gap-1 rounded-control border border-app p-0.5">
        {CHECKIN_DURATION_CHIPS.map((chip) => (
          <Chip
            key={chip.minutes}
            active={chipActive(chip.minutes)}
            disabled={disabled}
            onClick={() => {
              setCustomLabel(null);
              setOpen(false);
              setError(null);
              onChange(chip.minutes);
            }}
          >
            {chip.label}
          </Chip>
        ))}
        <Chip
          active={open || customLabel !== null}
          disabled={disabled}
          onClick={() => (open ? cancel() : openPanel())}
        >
          {customLabel ?? "Otra hora"}
        </Chip>
      </div>
      {open ? (
        <div className="flex flex-col gap-2 border-t border-app pt-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            Hora exacta
            <input
              type="time"
              value={draft}
              disabled={disabled}
              autoFocus
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirm();
                }
              }}
              className="min-h-11 rounded-control border border-app bg-transparent px-2 text-base text-main"
            />
          </label>
          <p className="text-xs text-muted">
            Entre las {clockTimeAfter(CHECKIN_MIN_MINUTES, now)} y las {clockTimeAfter(CHECKIN_MINUTES, now)} (15 min a 3 h)
          </p>
          {error ? (
            <p role="alert" className="text-xs font-semibold text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={disabled}
              className="min-h-11 flex-1 rounded-control bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={cancel}
              className="min-h-11 rounded-control px-3 text-sm font-semibold text-muted hover:text-main"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-9 flex-1 rounded-xs px-1 text-[13px] font-semibold tabular-nums transition-colors disabled:opacity-50 ${
        active ? "bg-surface-2 text-main ring-1 ring-[var(--border-strong)]" : "text-muted hover:text-main"
      }`}
    >
      {children}
    </button>
  );
}
