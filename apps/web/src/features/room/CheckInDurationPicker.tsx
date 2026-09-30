"use client";

import { useState } from "react";
import { CHECKIN_DURATION_CHIPS, clockTimeAfter, minutesUntilClockTime } from "./checkin-duration";

export interface CheckInDurationPickerProps {
  /** Currently chosen duration in minutes. */
  minutes: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
  now: Date;
}

/** "Hasta: [30 min] [1 h] [2 h] [3 h] [elegir hora]" — how long the user will occupy the seat. */
export function CheckInDurationPicker({ minutes, onChange, disabled = false, now }: CheckInDurationPickerProps) {
  const [custom, setCustom] = useState(false);
  const chipActive = (value: number) => !custom && minutes === value;

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Hasta cuándo vas a ocupar el lugar" className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-muted">Hasta:</span>
        {CHECKIN_DURATION_CHIPS.map((chip) => (
          <Chip
            key={chip.minutes}
            active={chipActive(chip.minutes)}
            disabled={disabled}
            onClick={() => {
              setCustom(false);
              onChange(chip.minutes);
            }}
          >
            {chip.label}
          </Chip>
        ))}
        <Chip active={custom} disabled={disabled} onClick={() => setCustom((v) => !v)}>
          elegir hora
        </Chip>
      </div>
      {custom ? (
        <label className="flex items-center gap-2 text-xs text-muted">
          Hora exacta
          <input
            type="time"
            value={clockTimeAfter(minutes, now)}
            disabled={disabled}
            onChange={(e) => {
              const next = minutesUntilClockTime(e.target.value, now);
              if (next !== null) onChange(next);
            }}
            className="min-h-9 rounded-lg border border-app bg-transparent px-2 text-sm text-main"
          />
          <span>(entre 15 min y 3 h)</span>
        </label>
      ) : null}
      <p className="text-xs text-muted">Ocupás el lugar hasta las {clockTimeAfter(minutes, now)}.</p>
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
      className={`min-h-9 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50 ${
        active ? "border-primary bg-primary text-white" : "border-app text-main hover:bg-[var(--surface-2)]"
      }`}
    >
      {children}
    </button>
  );
}
