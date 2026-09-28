"use client";

import type { SeatDto, TableType } from "@uns/contracts";
import { statusLabel } from "./format";

// Invisible enlarged tap target (mobile accessibility) — doesn't affect visual spacing since
// seats are spaced well apart (see packages/database/src/layout.ts) and 2*HIT_RADIUS < that gap.
const HIT_RADIUS = 26;

// Glossy sphere footprint, same for main-table chairs and wall-bar stools (the mockup draws
// both as top-down colored dots) — RING_R is the dark chair/stool base peeking out underneath.
const SEAT_R = 15;
const RING_R = SEAT_R + 4;
// Occupant photo badge radius — larger than the seat, still under half the seat spacing.
const PHOTO_R = 20;

// One shared radial gradient per status, defined once in RoomMap's <defs> and referenced here —
// keeps 108 seats cheap to paint (no per-seat filters/gradients).
const GRADIENT_ID: Record<"FREE" | "OCCUPIED" | "UNCERTAIN" | "UNKNOWN" | "MY_SEAT", string> = {
  FREE: "seat-sphere-free",
  OCCUPIED: "seat-sphere-occupied",
  UNCERTAIN: "seat-sphere-uncertain",
  UNKNOWN: "seat-sphere-unknown",
  MY_SEAT: "seat-sphere-mine",
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
  /** Which side of the table the seat sits on — used to cast its little contact shadow away from the tabletop. */
  facing: SeatFacing;
  isMySeat: boolean;
  isSelected: boolean;
  onSelect: (seat: SeatDto) => void;
  /** Photo of the identified occupant (only set when they chose to show themselves and their photo). */
  avatarUrl?: string | null;
}

export function Seat({ seat, tableLabel, tableType, facing, isMySeat, isSelected, onSelect, avatarUrl = null }: SeatProps) {
  const showPhoto = avatarUrl !== null && (seat.status === "OCCUPIED" || isMySeat);
  const clipId = `seat-photo-${seat.id}`;
  const visualStatus = isMySeat ? "MY_SEAT" : seat.status;
  const kind = tableType === "WALL_BAR" ? "Barra" : "Mesa";
  const hasOpenDispute = seat.dispute !== null;
  const ariaLabel = `${kind} ${tableLabel} asiento ${seat.seatNumber}: ${statusLabel(seat.status).toLowerCase()}${isMySeat ? " (tu lugar)" : ""}${hasOpenDispute ? " (en votación)" : ""}${seat.verified ? ", verificado con foto" : ""}`;
  const shadowCy = facing === "up" ? RING_R * 0.55 : -RING_R * 0.55;

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
        <circle r={RING_R + 7} fill="none" stroke="var(--seat-mine)" strokeWidth={2} className="seat-pulse-mine" />
      ) : null}
      {isSelected ? <circle r={RING_R + 5} fill="none" stroke="var(--primary)" strokeWidth={3} /> : null}
      {hasOpenDispute ? (
        <circle r={RING_R + 9} fill="none" stroke="var(--seat-uncertain)" strokeWidth={2} className="seat-pulse-dispute" />
      ) : null}

      <g className={visualStatus === "FREE" ? "seat-glow-free" : undefined}>
        {/* Contact shadow, cast toward the tabletop the chair is tucked under. */}
        <ellipse cx={0} cy={shadowCy} rx={SEAT_R * 0.85} ry={SEAT_R * 0.35} fill="rgb(0 0 0 / 0.22)" />
        {/* Dark base ring — the chair/stool seen from directly above, peeking out from under the seat. */}
        <circle r={RING_R} fill="var(--seat-ring)" />
        {/* Glossy seat sphere. */}
        <circle r={SEAT_R} fill={`url(#${GRADIENT_ID[visualStatus]})`} stroke="var(--seat-stroke)" strokeWidth={1} />
      </g>
      {showPhoto ? (
        // Occupant's photo as a round badge over the seat: white frame plus a ring in the seat's
        // status color, bigger than the plain seat so the face is recognizable on the map.
        <g transform={`rotate(${-seat.rotation})`}>
          <clipPath id={clipId}>
            <circle r={PHOTO_R} />
          </clipPath>
          <circle r={PHOTO_R + 4} fill={isMySeat ? "var(--seat-mine)" : "var(--seat-occupied)"} />
          <circle r={PHOTO_R + 1.5} fill="white" />
          <image
            href={avatarUrl}
            x={-PHOTO_R}
            y={-PHOTO_R}
            width={PHOTO_R * 2}
            height={PHOTO_R * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        </g>
      ) : null}
      <text
        display={showPhoto ? "none" : undefined}
        textAnchor="middle"
        dominantBaseline="central"
        y={1}
        fontSize={11}
        fontWeight={700}
        fill="white"
        transform={`rotate(${-seat.rotation})`}
      >
        {GLYPH[visualStatus]}
      </text>
      {seat.verified ? (
        <g transform={`translate(${SEAT_R - 3} ${-SEAT_R + 3}) rotate(${-seat.rotation})`}>
          <circle r={6} fill="#2563eb" stroke="white" strokeWidth={1.5} />
          <path d="M -2.5 0 L -0.5 2 L 2.5 -2.5" stroke="white" strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}
    </g>
  );
}
