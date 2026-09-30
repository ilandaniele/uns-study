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

/** Segmented "[30 min] [1 h] [2 h] [3 h] [Otra hora]" — how long the user will occupy the seat. */
export function CheckInDurationPicker({ minutes, onChange, disabled = false, now }: CheckInDurationPickerProps) {
  const [custom, setCustom] = useState(false);
  const chipActive = (value: number) => !custom && minutes === value;

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Hasta cuándo vas a ocupar el lugar" className="flex items-stretch gap-1 rounded-lg border border-app bg-[var(--surface-2)] p-1">
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
          Otra hora
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
      className={`min-h-9 flex-1 rounded-md px-1 text-[13px] font-semibold tabular-nums transition-colors disabled:opacity-50 ${
        active ? "bg-surface text-main shadow-sm ring-1 ring-[var(--border-strong)]" : "text-muted hover:text-main"
      }`}
    >
      {children}
    </button>
  );
}
