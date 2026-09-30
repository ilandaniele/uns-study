"use client";

import type { SeatAvatarDto, SeatDto, TableType } from "@uns/contracts";
import { memo } from "react";
import { statusLabel } from "./format";
import { AVATAR_BACKDROP, SILHOUETTE_BODY, SILHOUETTE_HEAD, seatAvatarRender } from "./seat-avatar";

// Invisible enlarged tap target (mobile accessibility) — doesn't affect visual spacing since
// seats are spaced well apart (see packages/database/src/layout.ts) and 2*HIT_RADIUS < that gap.
const HIT_RADIUS = 28;

// Top-down chair footprint, same for main-table chairs and wall-bar stools: a rounded-square status cushion
// on a wooden frame (RING_R bounds the frame; main-table chairs add a dark-wood backrest bar behind it).
const SEAT_R = 19;
const RING_R = SEAT_R + 4;
// Occupant photo badge radius — larger than the seat, still under half the seat spacing.
const PHOTO_R = 25;

// One shared radial gradient per status, defined once in RoomMap's <defs> and referenced here —
// keeps 108 seats cheap to paint (no per-seat filters/gradients).
const GRADIENT_ID: Record<"FREE" | "OCCUPIED" | "UNCERTAIN" | "SAVED" | "UNKNOWN" | "MY_SEAT", string> = {
  FREE: "seat-sphere-free",
  OCCUPIED: "seat-sphere-occupied",
  UNCERTAIN: "seat-sphere-uncertain",
  SAVED: "seat-sphere-saved",
  UNKNOWN: "seat-sphere-unknown",
  MY_SEAT: "seat-sphere-mine",
};

// Short glyph per status so color is never the only signal (accessibility, §7 of the UI spec).
const GLYPH: Record<"FREE" | "OCCUPIED" | "UNCERTAIN" | "SAVED" | "UNKNOWN" | "MY_SEAT", string> = {
  FREE: "L",
  OCCUPIED: "O",
  UNCERTAIN: "?",
  SAVED: "G",
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
  /** What to draw for whoever is checked in here: their photo, their alias animal or a silhouette. */
  avatar?: SeatAvatarDto | null;
}

export const Seat = memo(function Seat({ seat, tableLabel, tableType, facing, isMySeat, isSelected, onSelect, avatar = null }: SeatProps) {
  const badge = seatAvatarRender(avatar, seat.status === "OCCUPIED" || isMySeat);
  const showPhoto = badge !== null;
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
        {/* Backrest bar on the side away from the table (stools at wall bars have none). */}
        {tableType === "WALL_BAR" ? null : (
          <rect x={-RING_R + 2} y={facing === "up" ? -RING_R - 8 : RING_R} width={(RING_R - 2) * 2} height={8} rx={4} fill="var(--seat-backrest)" />
        )}
        {/* Wooden chair frame, seen from directly above, peeking out around the cushion. */}
        <rect x={-RING_R + 1} y={-RING_R + 1} width={(RING_R - 1) * 2} height={(RING_R - 1) * 2} rx={12} fill="var(--seat-ring)" />
        {/* Cushion, filled with the seat status. */}
        <rect
          x={-SEAT_R + 1}
          y={-SEAT_R + 1}
          width={(SEAT_R - 1) * 2}
          height={(SEAT_R - 1) * 2}
          rx={10}
          fill={`url(#${GRADIENT_ID[visualStatus]})`}
          stroke="var(--seat-stroke)"
          strokeWidth={1}
        />
      </g>
      {badge ? (
        // Occupant badge over the seat: white frame plus a ring in the seat's status color, bigger than
        // the plain seat so a face / animal is recognizable on the map.
        <g transform={`rotate(${-seat.rotation})`}>
          <clipPath id={clipId}>
            <circle r={PHOTO_R} />
          </clipPath>
          <circle r={PHOTO_R + 4} fill={isMySeat ? "var(--seat-mine)" : "var(--seat-occupied)"} />
          <circle r={PHOTO_R + 1.5} fill="white" />
          {badge.type === "photo" ? (
            <image
              href={badge.url}
              x={-PHOTO_R}
              y={-PHOTO_R}
              width={PHOTO_R * 2}
              height={PHOTO_R * 2}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${clipId})`}
            />
          ) : (
            <>
              <circle r={PHOTO_R} fill={AVATAR_BACKDROP} />
              {badge.type === "animal" ? (
                <image href={badge.src} x={-PHOTO_R * 0.72} y={-PHOTO_R * 0.72} width={PHOTO_R * 1.44} height={PHOTO_R * 1.44} />
              ) : (
                // Generic silhouette drawn in a 100x100 box, scaled to the badge and clipped to its circle.
                <g clipPath={`url(#${clipId})`} transform={`translate(${-PHOTO_R} ${-PHOTO_R}) scale(${(PHOTO_R * 2) / 100})`}>
                  <circle {...SILHOUETTE_HEAD} fill="white" />
                  <path d={SILHOUETTE_BODY} fill="white" />
                </g>
              )}
            </>
          )}
        </g>
      ) : null}
      <text
        display={showPhoto ? "none" : undefined}
        textAnchor="middle"
        dominantBaseline="central"
        y={1}
        fontSize={14}
        fontWeight={700}
        fill={visualStatus === "SAVED" ? "#422006" : "white"}
        transform={`rotate(${-seat.rotation})`}
      >
        {GLYPH[visualStatus]}
      </text>
      {seat.verified ? (
        <g transform={`translate(${SEAT_R - 3} ${-SEAT_R + 3}) rotate(${-seat.rotation})`}>
          <circle r={6} fill="#0f6e7e" stroke="white" strokeWidth={1.5} />
          <path d="M -2.5 0 L -0.5 2 L 2.5 -2.5" stroke="white" strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}
    </g>
  );
});
