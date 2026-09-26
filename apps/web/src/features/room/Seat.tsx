"use client";

import type { SeatDto, TableType } from "@uns/contracts";
import { statusLabel } from "./format";

const RADIUS = 15;
// Invisible enlarged tap target (mobile accessibility) — doesn't affect visual spacing since
// seats are 55-56 units apart (see packages/database/src/layout.ts) and 2*HIT_RADIUS < that gap.
const HIT_RADIUS = 26;

const FILL: Record<"FREE" | "OCCUPIED" | "UNCERTAIN" | "UNKNOWN" | "MY_SEAT", string> = {
  FREE: "#16a34a",
  OCCUPIED: "#dc2626",
  UNCERTAIN: "#d97706",
  UNKNOWN: "#9ca3af",
  MY_SEAT: "#2563eb",
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
      {isSelected ? (
        <circle r={RADIUS + 4} fill="none" stroke="#2563eb" strokeWidth={2.5} />
      ) : null}
      <circle r={RADIUS} fill={FILL[visualStatus]} stroke="white" strokeWidth={1.5} />
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
