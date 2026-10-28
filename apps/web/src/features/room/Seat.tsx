"use client";

import type { AdminBadgeLevel, SeatAvatarDto, SeatDto, TableType } from "@sala/contracts";
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
  /** Staff frame and crown: gold Admin or violet Superadmin. */
  adminBadge?: AdminBadgeLevel;
  /** Faded out by the "Solo libres" filter. */
  dimmed?: boolean;
  /** The viewer's favorite seat — gets a small star badge. */
  isFavorite?: boolean;
  /** Drawn over a photo of the room: the real chair is already there, so skip the drawn backrest. */
  photo?: boolean;
  disabled?: boolean;
}

export const Seat = memo(function Seat({ seat, tableLabel, tableType, facing, isMySeat, isSelected, onSelect, avatar = null, adminBadge = false, dimmed = false, isFavorite = false, photo = false, disabled = false }: SeatProps) {
  const badge = seatAvatarRender(avatar, seat.status === "OCCUPIED" || isMySeat);
  const showPhoto = badge !== null;
  const clipId = `seat-photo-${seat.id}`;
  const visualStatus = isMySeat ? "MY_SEAT" : seat.status;
  const kind = tableType === "WALL_BAR" ? "Barra" : "Mesa";
  const hasOpenDispute = seat.dispute !== null;
  const superAdmin = adminBadge === "SUPERADMIN";
  const staffInk = superAdmin ? "#24103f" : "#241b09";
  const staffColor = superAdmin ? "#a78bfa" : "#ffcf3f";
  const ariaLabel = `${kind} ${tableLabel} asiento ${seat.seatNumber}: ${statusLabel(seat.status).toLowerCase()}${isMySeat ? " (tu lugar)" : ""}${hasOpenDispute ? " (en votación)" : ""}${seat.verified ? ", verificado con foto" : ""}${adminBadge && badge ? superAdmin ? ", superadministrador" : ", administrador" : ""}`;
  const shadowCy = facing === "up" ? RING_R * 0.55 : -RING_R * 0.55;

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      aria-disabled={disabled || undefined}
      data-seat-id={seat.id}
      data-status={seat.status}
      className="seat-button cursor-pointer outline-none transition-opacity"
      opacity={dimmed ? 0.18 : 1}
      onClick={() => { if (!disabled) onSelect(seat); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!disabled) onSelect(seat);
        }
      }}
      transform={`translate(${seat.x} ${seat.y}) rotate(${seat.rotation})`}
    >
      {visualStatus === "FREE" ? (
        // Soft green halo: opacity-only animation stays on the compositor (no per-frame filter repaint).
        <circle r={RING_R + 9} fill="url(#seat-glow)" pointerEvents="none" className="seat-glow-free" />
      ) : null}
      <circle r={HIT_RADIUS} fill="transparent" />
      {isMySeat ? (
        <circle r={RING_R + 7} fill="none" stroke="var(--seat-mine)" strokeWidth={2} className="seat-pulse-mine" />
      ) : null}
      <circle r={RING_R + 5} fill="none" stroke="var(--primary)" strokeWidth={3} strokeDasharray="4 3" className="seat-focus-ring" />
      {isSelected ? <circle r={RING_R + 5} fill="none" stroke="var(--primary)" strokeWidth={3} /> : null}
      {hasOpenDispute ? (
        <circle r={RING_R + 9} fill="none" stroke="var(--seat-uncertain)" strokeWidth={2} className="seat-pulse-dispute" />
      ) : null}

      <g>
        {/* Contact shadow, cast toward the tabletop the chair is tucked under. */}
        <ellipse cx={0} cy={shadowCy} rx={SEAT_R * 0.85} ry={SEAT_R * 0.35} fill="rgb(0 0 0 / 0.22)" />
        {/* Backrest bar on the side away from the table (stools at wall bars have none). */}
        {tableType === "WALL_BAR" || photo ? null : (
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
              <circle r={PHOTO_R} fill={badge.type === "animal" ? badge.backdrop : AVATAR_BACKDROP} />
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
          {adminBadge ? (
            <g aria-hidden="true" pointerEvents="none" data-admin-marker="true" data-staff-level={superAdmin ? "SUPERADMIN" : "ADMIN"}>
              <circle r={PHOTO_R + 3} fill="none" stroke={staffInk} strokeWidth={8} />
              <circle r={PHOTO_R + 3} fill="none" stroke={staffColor} strokeWidth={5} />
              <g transform={`translate(18 ${-PHOTO_R + 3})`}>
                <circle r={12} fill={superAdmin ? "#6d28d9" : staffColor} stroke={staffInk} strokeWidth={2.5} />
                {superAdmin ? <path d="M-4-4-8 0-4 4M4-4 8 0 4 4M1-5-1 5" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/> : <><path d="M-7-4-4 0 0-6 4 0 7-4 5 5H-5Z" fill={staffInk} stroke={staffInk} strokeLinejoin="round"/><path d="M-4 8H4" stroke={staffInk} strokeWidth={2} strokeLinecap="round"/></>}
              </g>
            </g>
          ) : null}
        </g>
      ) : null}
      <text
        display={showPhoto ? "none" : undefined}
        textAnchor="middle"
        dominantBaseline="central"
        y={1}
        fontSize={14}
        fontWeight={700}
        fill={visualStatus === "SAVED" ? "var(--seat-glyph-saved)" : "var(--seat-glyph)"}
        transform={`rotate(${-seat.rotation})`}
      >
        {GLYPH[visualStatus]}
      </text>
      {isFavorite ? (
        <g transform={`translate(${-SEAT_R + 3} ${-SEAT_R + 3}) rotate(${-seat.rotation})`}>
          <circle r={6.5} fill="var(--seat-saved)" stroke="white" strokeWidth={1.5} />
          <path
            d="M 0 -3.6 L 1.05 -1.1 L 3.6 -1 L 1.65 0.65 L 2.3 3.2 L 0 1.8 L -2.3 3.2 L -1.65 0.65 L -3.6 -1 L -1.05 -1.1 Z"
            fill="var(--seat-glyph-saved)"
          />
        </g>
      ) : null}
      {seat.verified ? (
        <g transform={`translate(${SEAT_R - 3} ${-SEAT_R + 3}) rotate(${-seat.rotation})`}>
          <circle r={6} fill="var(--color-primary)" stroke="white" strokeWidth={1.5} />
          <path d="M -2.5 0 L -0.5 2 L 2.5 -2.5" stroke="white" strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}
    </g>
  );
});
