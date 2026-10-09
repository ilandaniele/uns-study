"use client";

import type { RoomMapDto, SeatAvatarDto, SeatDto } from "@sala/contracts";
import { memo, useCallback, useMemo } from "react";
import { photoSkinFor, type PhotoSkin } from "./photo-skin";
import { Seat, type SeatFacing } from "./Seat";
import { StudyTable } from "./StudyTable";
import { WallBar } from "./WallBar";

export interface RoomMapProps {
  map: RoomMapDto;
  mySeatId: string | null;
  selectedSeatId: string | null;
  onSelectSeat: (seat: SeatDto) => void;
  /** Table code to highlight (e.g. from a scanned QR deep link), see `useQrContext`. */
  highlightTableCode?: string | null;
  /** Badge descriptor per seat id for every checked-in occupant (photo, alias animal or silhouette). */
  avatarBySeatId?: ReadonlyMap<string, SeatAvatarDto>;
  /** Seats whose occupant carries the gold "Admin" badge. */
  adminBadgeSeatIds?: ReadonlySet<string>;
  /** "Solo libres": fade every seat that isn't FREE (the viewer's own and selected seat stay visible). */
  onlyFree?: boolean;
  /** The viewer's favorite seat, drawn with a small star. */
  favoriteSeatId?: string | null;
}

// Seat status keys that get a shared radial-gradient "glossy sphere" fill, defined once below
// and referenced by id from Seat.tsx — avoids per-seat gradients/filters across 108 seats.
const SEAT_GRADIENT_KEYS = ["free", "occupied", "uncertain", "saved", "unknown", "mine"] as const;

// Side-wall window panels (y) and back-wall window count, all purely decorative.
const BACK_WINDOWS = 6;
const SIDE_WINDOW_LENGTH = 220;
const SIDE_WINDOW_Y = [130, 400, 670, 940, 1210];

export const RoomMap = memo(function RoomMap({ map, mySeatId, selectedSeatId, onSelectSeat, highlightTableCode = null, avatarBySeatId, adminBadgeSeatIds, onlyFree = false, favoriteSeatId = null }: RoomMapProps) {
  // Photo of the real room when one matches this layout; the drawn room otherwise.
  const skin = useMemo(() => photoSkinFor(map), [map]);
  const { width, height } = skin?.viewBox ?? map.viewBox;
  // Per-seat facing + table label/type only depend on the layout, not on live seat status.
  const seatMeta = useMemo(() => {
    const tableById = new Map(map.tables.map((table) => [table.id, table]));
    return new Map(
      map.seats.map((seat) => {
        const table = tableById.get(seat.tableId);
        const facing: SeatFacing = table && seat.y < table.y + table.height / 2 ? "up" : "down";
        return [seat.id, { facing, tableLabel: table?.label ?? seat.code, tableType: table?.type ?? ("MAIN_TABLE" as const) }] as const;
      }),
    );
  }, [map.seats, map.tables]);
  // Over the photo, each marker sits on its real chair; the layout coordinates stay canonical for everything else.
  const displaySeats = useMemo(
    () => (skin ? map.seats.map((seat) => ({ ...seat, ...skin.seats.get(seat.code)!, rotation: 0 })) : map.seats),
    [map.seats, skin],
  );
  const handleSelect = useCallback(
    (shown: SeatDto) => onSelectSeat(map.seats.find((seat) => seat.id === shown.id) ?? shown),
    [map.seats, onSelectSeat],
  );
  const selectedSeat = selectedSeatId ? displaySeats.find((seat) => seat.id === selectedSeatId) ?? null : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      role="group"
      aria-label={`Mapa de ${map.room.name}`}
    >
      <SharedDefs />
      {skin ? (
        <PhotoBackdrop skin={skin} tables={map.tables} highlightTableCode={highlightTableCode} />
      ) : (
        <>
          <StaticRoomBackdrop width={width} height={height} />
          {map.tables.map((table) =>
            table.type === "WALL_BAR" ? (
              <WallBar key={table.id} table={table} />
            ) : (
              <StudyTable key={table.id} table={table} highlighted={highlightTableCode !== null && table.code === highlightTableCode} />
            ),
          )}
        </>
      )}

      {displaySeats.map((seat) => {
        const meta = seatMeta.get(seat.id)!;
        return (
          <Seat
            key={seat.id}
            seat={seat}
            tableLabel={meta.tableLabel}
            tableType={meta.tableType}
            facing={meta.facing}
            isMySeat={seat.id === mySeatId}
            isSelected={seat.id === selectedSeatId}
            onSelect={handleSelect}
            avatar={avatarBySeatId?.get(seat.id) ?? null}
            adminBadge={adminBadgeSeatIds?.has(seat.id) ?? false}
            dimmed={onlyFree && seat.status !== "FREE" && seat.id !== mySeatId && seat.id !== selectedSeatId}
            isFavorite={seat.id === favoriteSeatId}
            photo={skin !== null}
          />
        );
      })}

      {/* Drawn room only: photo-style vignette, then a dark-mode dimmer (the photo has its own night version). */}
      {skin ? null : (
        <>
          <rect x={0} y={0} width={width} height={height} fill="url(#room-vignette)" pointerEvents="none" aria-hidden="true" />
          <rect x={0} y={0} width={width} height={height} fill="black" style={{ opacity: "var(--room-dark-overlay)" }} pointerEvents="none" aria-hidden="true" />
        </>
      )}

      {/* Selected seat: dim the rest of the room and ring the seat, so it stays findable while the detail sheet is open. */}
      {selectedSeat ? (
        <g pointerEvents="none" aria-hidden="true">
          {/* Room-sized rect with a circular hole (even-odd) around the seat. */}
          <path
            d={`M0 0H${width}V${height}H0Z M${selectedSeat.x - 62} ${selectedSeat.y}a62 62 0 1 0 124 0a62 62 0 1 0 -124 0Z`}
            fill="black"
            fillRule="evenodd"
            opacity={0.4}
          />
          <circle cx={selectedSeat.x} cy={selectedSeat.y} r={40} fill="none" stroke="var(--primary)" strokeWidth={6} />
          <circle cx={selectedSeat.x} cy={selectedSeat.y} r={40} fill="none" stroke="var(--primary)" strokeWidth={4} key={selectedSeat.id} className="seat-spot-ring" />
        </g>
      ) : null}
    </svg>
  );
});

/** Seat gradients used by every seat, in both the drawn and the photo room. */
const SharedDefs = memo(function SharedDefs() {
  return (
    <defs>
        {/* Halo behind FREE seats; its opacity is animated in CSS (see .seat-glow-free). */}
        <radialGradient id="seat-glow">
          <stop offset="40%" stopColor="var(--seat-free)" stopOpacity={0.45} />
          <stop offset="100%" stopColor="var(--seat-free)" stopOpacity={0} />
        </radialGradient>
        {SEAT_GRADIENT_KEYS.map((key) => (
          <radialGradient key={key} id={`seat-sphere-${key}`} cx="35%" cy="28%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.4} />
            <stop offset="55%" stopColor={`var(--seat-${key})`} />
            <stop offset="100%" stopColor={`var(--seat-${key})`} stopOpacity={0.88} />
          </radialGradient>
        ))}
    </defs>
  );
});

/**
 * The real room photographed from above: the day photo in the light theme, the night photo in the
 * dark theme. Tables are painted in the photo, so only a nickname (over the painted "Mesa N") and
 * the QR highlight are drawn on top.
 */
const PhotoBackdrop = memo(function PhotoBackdrop({ skin, tables, highlightTableCode }: { skin: PhotoSkin; tables: RoomMapDto["tables"]; highlightTableCode: string | null }) {
  const { width, height } = skin.viewBox;
  return (
    <>
      <image href={skin.dayHref} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid slice" className="dark:hidden" aria-hidden="true" />
      <image href={skin.nightHref} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid slice" className="hidden dark:inline" aria-hidden="true" />
      {tables.map((table) => {
        const rect = skin.tables.get(table.code);
        if (!rect) return null;
        const highlighted = highlightTableCode !== null && table.code === highlightTableCode;
        return (
          <g key={table.id} aria-hidden="true" pointerEvents="none">
            {highlighted ? (
              <rect x={rect.x - 8} y={rect.y - 8} width={rect.width + 16} height={rect.height + 16} rx={14} fill="none" stroke="var(--primary)" strokeWidth={6} />
            ) : null}
            {table.nickname ? <RoomLabelPill x={rect.x + rect.width / 2} y={rect.y + rect.height / 2} text={table.nickname} /> : null}
          </g>
        );
      })}
    </>
  );
});

/** Floor, walls, windows, entrance and drawn-room defs: nothing here depends on live seat state. */
const StaticRoomBackdrop = memo(function StaticRoomBackdrop({ width, height }: { width: number; height: number }) {
  return (
    <>
      <defs>
        {/* Plain salmon linoleum with a very faint large tile seam grid. */}
        <pattern id="floor-tiles" width={250} height={250} patternUnits="userSpaceOnUse">
          <rect width={250} height={250} fill="var(--room-floor-a)" />
          <path d="M 0 0.5 H 250 M 0.5 0 V 250" stroke="var(--room-floor-seam)" strokeWidth={1} opacity={0.18} fill="none" />
        </pattern>
        <linearGradient id="floor-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.14} />
          <stop offset="50%" stopColor="#ffffff" stopOpacity={0} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.1} />
        </linearGradient>
        <linearGradient id="window-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
          <stop offset="45%" stopColor="#ffffff" stopOpacity={0.05} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
        {/* Sunlight pool falling from the top windows, blended softly over the floor/tables. */}
        <radialGradient id="room-light-pool" cx="50%" cy="6%" r="65%">
          <stop offset="0%" stopColor="#fff6e3" stopOpacity={0.55} />
          <stop offset="55%" stopColor="#fff6e3" stopOpacity={0.14} />
          <stop offset="100%" stopColor="#fff6e3" stopOpacity={0} />
        </radialGradient>
        {/* Photo-style vignette, darkening the corners/edges of the "photograph". */}
        <radialGradient id="room-vignette" cx="50%" cy="48%" r="72%">
          <stop offset="55%" stopColor="#000000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.24} />
        </radialGradient>
        <linearGradient id="wood-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ecd8b2" />
          <stop offset="45%" stopColor="#e2c898" />
          <stop offset="100%" stopColor="#d6b884" />
        </linearGradient>
        <linearGradient id="wainscot-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--room-wainscot)" />
          <stop offset="100%" stopColor="var(--room-wainscot-dark)" />
        </linearGradient>
        <linearGradient id="wainscot-gradient-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--room-wainscot-dark)" />
          <stop offset="100%" stopColor="var(--room-wainscot)" />
        </linearGradient>
        <linearGradient id="window-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--room-window-glass-a)" />
          <stop offset="100%" stopColor="var(--room-window-glass-b)" />
        </linearGradient>
        <linearGradient id="window-glass-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--room-window-glass-a)" />
          <stop offset="100%" stopColor="var(--room-window-glass-b)" />
        </linearGradient>
        {/* Wainscot plank seams (vertical seams for the top/bottom walls, horizontal for the side walls). */}
        <pattern id="wainscot-planks" width={34} height={26} patternUnits="userSpaceOnUse">
          <path d="M 0.5 0 V 26" stroke="var(--room-wainscot-dark)" strokeWidth={1.5} opacity={0.55} fill="none" />
        </pattern>
        <pattern id="wainscot-planks-v" width={12} height={34} patternUnits="userSpaceOnUse">
          <path d="M 0 0.5 H 12" stroke="var(--room-wainscot-dark)" strokeWidth={1.5} opacity={0.55} fill="none" />
        </pattern>
        <filter id="table-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.15" />
        </filter>
      </defs>

      {/* Floor */}
      <rect x={4} y={4} width={width - 8} height={height - 8} rx={28} fill="url(#floor-tiles)" />
      <rect x={4} y={4} width={width - 8} height={height - 8} rx={28} fill="url(#floor-sheen)" aria-hidden="true" />
      <rect x={4} y={4} width={width - 8} height={height - 8} rx={28} fill="url(#room-light-pool)" opacity={0.5} aria-hidden="true" />

      {/* Walls: cream upper wall with a honey wood wainscot band along the room side, windows on top. */}
      <g aria-hidden="true">
        {/* Back (top) wall */}
        <rect x={0} y={0} width={width} height={84} fill="var(--room-wall-upper)" />
        <rect x={0} y={58} width={width} height={26} fill="url(#wainscot-gradient)" />
        <rect x={0} y={58} width={width} height={26} fill="url(#wainscot-planks)" />
        <rect x={0} y={56} width={width} height={3} fill="var(--room-window-frame)" />
        <rect x={0} y={83} width={width} height={2} fill="var(--room-wall)" opacity={0.6} />
        {/* Side walls */}
        <rect x={0} y={84} width={32} height={height - 84} fill="var(--room-wall-upper)" />
        <rect x={20} y={84} width={12} height={height - 84} fill="url(#wainscot-gradient-h)" />
        <rect x={20} y={84} width={12} height={height - 84} fill="url(#wainscot-planks-v)" />
        <rect x={width - 32} y={84} width={32} height={height - 84} fill="var(--room-wall-upper)" />
        <rect x={width - 32} y={84} width={12} height={height - 84} fill="url(#wainscot-gradient-h)" />
        <rect x={width - 32} y={84} width={12} height={height - 84} fill="url(#wainscot-planks-v)" />
        {/* Front (bottom) wall */}
        <rect x={0} y={height - 38} width={width} height={38} fill="var(--room-wall-upper)" />
        <rect x={0} y={height - 38} width={width} height={20} fill="url(#wainscot-gradient)" />
        <rect x={0} y={height - 38} width={width} height={20} fill="url(#wainscot-planks)" />
        <rect x={0} y={height - 40} width={width} height={2} fill="var(--room-wall)" opacity={0.6} />
      </g>

      {/* Tall multi-pane windows along the back wall, each with a sill and a radiator grille below. */}
      <g aria-hidden="true">
        {Array.from({ length: BACK_WINDOWS }, (_, i) => {
          const w = 130;
          const cx = ((i + 0.5) * width) / BACK_WINDOWS;
          return (
            <g key={i}>
              <WindowPanes x={cx - w / 2} y={6} w={w} h={46} cols={3} rows={4} />
              <rect x={cx - w / 2 - 5} y={52} width={w + 10} height={6} rx={2} fill="var(--room-window-frame)" stroke="var(--room-wainscot-dark)" strokeWidth={0.8} />
              <Radiator x={cx - 32} y={62} w={64} h={18} vertical />
            </g>
          );
        })}
      </g>

      {/* Windows along both side walls (5 panels per side) with radiator grilles beside them. */}
      <g aria-hidden="true">
        {SIDE_WINDOW_Y.map((y) =>
          [3, width - 21].map((x) => (
            <g key={`${x}-${y}`}>
              <WindowPanes x={x} y={y} w={18} h={SIDE_WINDOW_LENGTH} cols={3} rows={4} />
              <Radiator x={x === 3 ? 22 : width - 30} y={y + SIDE_WINDOW_LENGTH / 2 - 26} w={8} h={52} vertical={false} />
            </g>
          )),
        )}
      </g>

      {/* Entrance glass doors at the bottom wall. */}
      <g aria-hidden="true">
        <rect x={width / 2 - 90} y={height - 14} width={180} height={20} fill="var(--room-floor-a)" />
        <rect x={width / 2 - 84} y={height - 72} width={78} height={64} rx={6} fill="url(#window-glass)" stroke="var(--room-window-frame)" strokeWidth={4} />
        <rect x={width / 2 + 6} y={height - 72} width={78} height={64} rx={6} fill="url(#window-glass)" stroke="var(--room-window-frame)" strokeWidth={4} />
        <line x1={width / 2} y1={height - 72} x2={width / 2} y2={height - 8} stroke="var(--room-window-frame)" strokeWidth={4} />
      </g>
      <RoomLabelPill x={width / 2} y={height - 34} text="Entrada" />
    </>
  );
});

/** White-framed window: light glass with a soft diagonal reflection and a `cols` x `rows` grid of small panes. */
function WindowPanes({ x, y, w, h, cols, rows }: { x: number; y: number; w: number; h: number; cols: number; rows: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2} fill="url(#window-glass)" />
      <rect x={x} y={y} width={w} height={h} rx={2} fill="url(#window-sheen)" />
      {Array.from({ length: cols - 1 }, (_, i) => (
        <line key={`c${i}`} x1={x + ((i + 1) * w) / cols} y1={y} x2={x + ((i + 1) * w) / cols} y2={y + h} stroke="var(--room-window-frame)" strokeWidth={1.6} />
      ))}
      {Array.from({ length: rows - 1 }, (_, i) => (
        <line key={`r${i}`} x1={x} y1={y + ((i + 1) * h) / rows} x2={x + w} y2={y + ((i + 1) * h) / rows} stroke="var(--room-window-frame)" strokeWidth={1.6} />
      ))}
      <rect x={x} y={y} width={w} height={h} rx={2} fill="none" stroke="var(--room-window-frame)" strokeWidth={3} />
    </g>
  );
}

/** Small cream radiator grille made of thin slats (vertical slats under back windows, horizontal on side walls). */
function Radiator({ x, y, w, h, vertical }: { x: number; y: number; w: number; h: number; vertical: boolean }) {
  const slats = vertical ? 9 : 8;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2} fill="var(--room-radiator)" stroke="var(--room-wainscot-dark)" strokeWidth={0.8} />
      {Array.from({ length: slats }, (_, i) =>
        vertical ? (
          <line key={i} x1={x + ((i + 1) * w) / (slats + 1)} y1={y + 2} x2={x + ((i + 1) * w) / (slats + 1)} y2={y + h - 2} stroke="var(--room-wainscot-dark)" strokeWidth={1} opacity={0.55} />
        ) : (
          <line key={i} x1={x + 1.5} y1={y + ((i + 1) * h) / (slats + 1)} x2={x + w - 1.5} y2={y + ((i + 1) * h) / (slats + 1)} stroke="var(--room-wainscot-dark)" strokeWidth={1} opacity={0.55} />
        ),
      )}
    </g>
  );
}

function RoomLabelPill({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * 13 + 44;
  return (
    <g aria-hidden="true">
      <rect x={x - w / 2} y={y - 21} width={w} height={42} rx={21} fill="var(--surface)" stroke="var(--border)" strokeWidth={1} opacity={0.95} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={600} className="font-display" fill="var(--text)">
        {text}
      </text>
    </g>
  );
}
