"use client";

import type { SeatDto, TableType } from "@uns/contracts";
import { statusLabel } from "./format";

const RADIUS = 15;
// Invisible enlarged tap target (mobile accessibility) — doesn't affect visual spacing since
// seats are 55-56 units apart (see packages/database/src/layout.ts) and 2*HIT_RADIUS < that gap.
const HIT_RADIUS = 26;

const FILL: Record<"FREE" | "OCCUPIED" | "UNCERTAIN" | "UNKNOWN" | "MY_SEAT", string> = {
  FREE: "var(--seat-free)",
  OCCUPIED: "var(--seat-occupied)",
  UNCERTAIN: "var(--seat-uncertain)",
  UNKNOWN: "var(--seat-unknown)",
  MY_SEAT: "var(--seat-mine)",
};

// Short glyph per status so color is never the only signal (accessibility, §7 of the UI spec).
const GLYPH: Record<"FREE" | "OCCUPIED" | "UNCERTAIN" | "UNKNOWN" | "MY_SEAT", string> = {
  FREE: "L",
  OCCUPIED: "O",
  UNCERTAIN: "?",
  UNKNOWN: "-",
  MY_SEAT: "★",
};

export interface SeatProps {
  seat: SeatDto;
  tableLabel: string;
  tableType: TableType;
  isMySeat: boolean;
  isSelected: boolean;
  onSelect: (seat: SeatDto) => void;
}

export function Seat({ seat, tableLabel, tableType, isMySeat, isSelected, onSelect }: SeatProps) {
  const visualStatus = isMySeat ? "MY_SEAT" : seat.status;
  const kind = tableType === "WALL_BAR" ? "Barra" : "Mesa";
  const ariaLabel = `${kind} ${tableLabel} asiento ${seat.seatNumber}: ${statusLabel(seat.status).toLowerCase()}${isMySeat ? " (tu lugar)" : ""}`;

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      className="cursor-pointer outline-none"
      onClick={() => onSelect(seat)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(seat);
        }
      }}
      transform={`translate(${seat.x} ${seat.y}) rotate(${seat.rotation})`}
    >
      <circle r={HIT_RADIUS} fill="transparent" />
      {isMySeat ? (
        <circle r={RADIUS + 6} fill="none" stroke="var(--seat-mine)" strokeWidth={2} className="seat-pulse-mine" />
      ) : null}
      {isSelected ? <circle r={RADIUS + 4} fill="none" stroke="var(--primary)" strokeWidth={2.5} /> : null}
      <circle
        r={RADIUS}
        fill={FILL[visualStatus]}
        stroke="var(--seat-stroke)"
        strokeWidth={1.5}
        className={visualStatus === "FREE" ? "seat-glow-free" : undefined}
      />
      <circle r={RADIUS - 5} fill="none" stroke="rgb(0 0 0 / 0.18)" strokeWidth={1.5} />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={700}
        fill="white"
        transform={`rotate(${-seat.rotation})`}
      >
        {GLYPH[visualStatus]}
      </text>
    </g>
  );
}
