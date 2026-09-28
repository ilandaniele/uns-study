"use client";

import type { SeatDto, TableType } from "@uns/contracts";
import { statusLabel } from "./format";

// Invisible enlarged tap target (mobile accessibility) — doesn't affect visual spacing since
// seats are spaced well apart (see packages/database/src/layout.ts) and 2*HIT_RADIUS < that gap.
const HIT_RADIUS = 26;

// Chair footprint for seats at a main table.
const SEAT_SIZE = 36;
const SEAT_RX = 9;
const BACK_LENGTH = 36;
const BACK_THICKNESS = 8;
const BACK_GAP = 14; // distance from seat center to the near edge of the backrest

// Round stool footprint for wall-bar seats.
const STOOL_RADIUS = 16;

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

export type SeatFacing = "up" | "down";

export interface SeatProps {
  seat: SeatDto;
  tableLabel: string;
  tableType: TableType;
  /** Which way the seat's backrest points (away from the table) — ignored for wall-bar stools. */
  facing: SeatFacing;
  isMySeat: boolean;
  isSelected: boolean;
  onSelect: (seat: SeatDto) => void;
}

export function Seat({ seat, tableLabel, tableType, facing, isMySeat, isSelected, onSelect }: SeatProps) {
  const visualStatus = isMySeat ? "MY_SEAT" : seat.status;
  const kind = tableType === "WALL_BAR" ? "Barra" : "Mesa";
  const ariaLabel = `${kind} ${tableLabel} asiento ${seat.seatNumber}: ${statusLabel(seat.status).toLowerCase()}${isMySeat ? " (tu lugar)" : ""}`;
  const isStool = tableType === "WALL_BAR";
  const backY = facing === "up" ? -(BACK_GAP + BACK_THICKNESS) : BACK_GAP;

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
        <circle
          r={(isStool ? STOOL_RADIUS : SEAT_SIZE / 2) + 7}
          fill="none"
          stroke="var(--seat-mine)"
          strokeWidth={2}
          className="seat-pulse-mine"
        />
      ) : null}
      {isSelected ? (
        <circle r={(isStool ? STOOL_RADIUS : SEAT_SIZE / 2) + 5} fill="none" stroke="var(--primary)" strokeWidth={3} />
      ) : null}

      <g className={visualStatus === "FREE" ? "seat-glow-free" : undefined}>
        {isStool ? (
          <circle r={STOOL_RADIUS} fill={FILL[visualStatus]} stroke="var(--seat-stroke)" strokeWidth={1.5} />
        ) : (
          <>
            <rect
              x={-BACK_LENGTH / 2}
              y={backY}
              width={BACK_LENGTH}
              height={BACK_THICKNESS}
              rx={3}
              fill={FILL[visualStatus]}
              stroke="var(--seat-stroke)"
              strokeWidth={1}
            />
            <rect
              x={-SEAT_SIZE / 2}
              y={-SEAT_SIZE / 2}
              width={SEAT_SIZE}
              height={SEAT_SIZE}
              rx={SEAT_RX}
              fill={FILL[visualStatus]}
              stroke="var(--seat-stroke)"
              strokeWidth={1.5}
            />
          </>
        )}
      </g>
      <circle r={isStool ? STOOL_RADIUS - 5 : SEAT_SIZE / 2 - 6} fill="none" stroke="rgb(0 0 0 / 0.18)" strokeWidth={1.5} />
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
