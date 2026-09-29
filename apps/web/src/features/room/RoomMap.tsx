"use client";

import type { RoomMapDto, SeatDto, TableDto } from "@uns/contracts";
import { memo, useMemo } from "react";
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
  /** Avatar URL per seat id for occupants who chose to show themselves with a photo. */
  avatarBySeatId?: ReadonlyMap<string, string>;
}

// Seat status keys that get a shared radial-gradient "glossy sphere" fill, defined once below
// and referenced by id from Seat.tsx — avoids per-seat gradients/filters across 108 seats.
const SEAT_GRADIENT_KEYS = ["free", "occupied", "uncertain", "unknown", "mine"] as const;

// Plants dotted along the central aisle, near the windows and near the entrance. Purely decorative.
const AISLE_PLANTS = [
  { x: 400, y: 150 },
  { x: 600, y: 1450 },
];

export function RoomMap({ map, mySeatId, selectedSeatId, onSelectSeat, highlightTableCode = null, avatarBySeatId }: RoomMapProps) {
  const { width, height } = map.viewBox;
  const wallBars = useMemo(() => map.tables.filter((table) => table.type === "WALL_BAR"), [map.tables]);
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

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      role="group"
      aria-label={`Mapa de ${map.room.name}`}
    >
      <StaticRoomBackdrop width={width} height={height} wallBars={wallBars} />

      {map.tables.map((table) =>
        table.type === "WALL_BAR" ? (
          <WallBar key={table.id} table={table} />
        ) : (
          <StudyTable key={table.id} table={table} highlighted={highlightTableCode !== null && table.code === highlightTableCode} />
        ),
      )}

      {map.seats.map((seat) => {
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
            onSelect={onSelectSeat}
            avatarUrl={avatarBySeatId?.get(seat.id) ?? null}
          />
        );
      })}

      {/* Photo-style vignette on top of everything, then a dark-mode dimmer — the room stays warm, just dimmed. */}
      <rect x={0} y={0} width={width} height={height} fill="url(#room-vignette)" pointerEvents="none" aria-hidden="true" />
      <rect x={0} y={0} width={width} height={height} fill="black" style={{ opacity: "var(--room-dark-overlay)" }} pointerEvents="none" aria-hidden="true" />
    </svg>
  );
}

/** Floor, walls, windows, entrance, plants and shared defs: nothing here depends on live seat state. */
const StaticRoomBackdrop = memo(function StaticRoomBackdrop({ width, height, wallBars }: { width: number; height: number; wallBars: TableDto[] }) {
  return (
    <>
      <defs>
        {/* Warm terracotta parquet floor: two plank tones in a basket-weave offset, plus faint grain lines. */}
        <pattern id="floor-parquet" width={120} height={120} patternUnits="userSpaceOnUse">
          {/* Speckled vinyl tiles like the real room floor: salmon base, darker and lighter flecks, faint seams. */}
          <rect width={120} height={120} fill="var(--room-floor-a)" />
          <g fill="var(--room-floor-b)" opacity={0.7}>
            <ellipse cx={11.3} cy={69.9} rx={3.0} ry={1.1} transform="rotate(22 11.3 69.9)" />
            <ellipse cx={52.0} cy={8.4} rx={1.4} ry={1.4} transform="rotate(144 52.0 8.4)" />
            <ellipse cx={70.3} cy={6.0} rx={1.6} ry={1.6} transform="rotate(34 70.3 6.0)" />
            <ellipse cx={34.8} cy={17.3} rx={1.4} ry={1.2} transform="rotate(174 34.8 17.3)" />
            <ellipse cx={85.5} cy={67.7} rx={2.4} ry={1.5} transform="rotate(136 85.5 67.7)" />
            <ellipse cx={51.3} cy={37.7} rx={2.4} ry={1.4} transform="rotate(76 51.3 37.7)" />
            <ellipse cx={63.0} cy={105.0} rx={2.7} ry={1.2} transform="rotate(18 63.0 105.0)" />
            <ellipse cx={14.2} cy={50.2} rx={2.7} ry={1.0} transform="rotate(125 14.2 50.2)" />
            <ellipse cx={40.8} cy={42.0} rx={2.2} ry={1.9} transform="rotate(17 40.8 42.0)" />
            <ellipse cx={100.8} cy={113.4} rx={2.1} ry={1.7} transform="rotate(15 100.8 113.4)" />
            <ellipse cx={34.2} cy={46.3} rx={2.5} ry={0.8} transform="rotate(118 34.2 46.3)" />
            <ellipse cx={42.7} cy={73.3} rx={2.2} ry={1.1} transform="rotate(73 42.7 73.3)" />
            <ellipse cx={20.0} cy={48.2} rx={1.8} ry={1.0} transform="rotate(110 20.0 48.2)" />
            <ellipse cx={103.7} cy={33.4} rx={2.0} ry={1.3} transform="rotate(97 103.7 33.4)" />
            <ellipse cx={1.4} cy={99.7} rx={1.6} ry={1.2} transform="rotate(37 1.4 99.7)" />
            <ellipse cx={50.3} cy={44.3} rx={2.3} ry={2.1} transform="rotate(176 50.3 44.3)" />
            <ellipse cx={107.9} cy={93.6} rx={2.9} ry={1.9} transform="rotate(100 107.9 93.6)" />
            <ellipse cx={47.8} cy={47.3} rx={2.2} ry={1.4} transform="rotate(48 47.8 47.3)" />
            <ellipse cx={12.3} cy={68.0} rx={2.3} ry={2.1} transform="rotate(157 12.3 68.0)" />
            <ellipse cx={3.1} cy={104.9} rx={2.4} ry={1.0} transform="rotate(64 3.1 104.9)" />
            <ellipse cx={119.2} cy={55.9} rx={2.2} ry={0.9} transform="rotate(26 119.2 55.9)" />
            <ellipse cx={90.0} cy={88.8} rx={2.2} ry={1.8} transform="rotate(132 90.0 88.8)" />
            <ellipse cx={109.7} cy={91.0} rx={1.8} ry={1.7} transform="rotate(23 109.7 91.0)" />
            <ellipse cx={83.5} cy={31.3} rx={1.9} ry={1.0} transform="rotate(57 83.5 31.3)" />
            <ellipse cx={96.7} cy={98.2} rx={2.7} ry={1.1} transform="rotate(132 96.7 98.2)" />
            <ellipse cx={59.1} cy={87.7} rx={3.2} ry={1.9} transform="rotate(120 59.1 87.7)" />
            <ellipse cx={114.6} cy={43.8} rx={1.6} ry={1.1} transform="rotate(50 114.6 43.8)" />
            <ellipse cx={40.5} cy={57.9} rx={3.2} ry={1.7} transform="rotate(0 40.5 57.9)" />
            <ellipse cx={14.4} cy={46.6} rx={2.6} ry={1.1} transform="rotate(45 14.4 46.6)" />
            <ellipse cx={52.1} cy={76.3} rx={1.4} ry={2.1} transform="rotate(101 52.1 76.3)" />
            <ellipse cx={3.3} cy={70.9} rx={2.1} ry={1.7} transform="rotate(156 3.3 70.9)" />
            <ellipse cx={99.2} cy={117.6} rx={2.5} ry={1.3} transform="rotate(140 99.2 117.6)" />
            <ellipse cx={63.2} cy={112.0} rx={2.1} ry={2.0} transform="rotate(54 63.2 112.0)" />
            <ellipse cx={3.4} cy={25.5} rx={2.2} ry={1.9} transform="rotate(83 3.4 25.5)" />
            <ellipse cx={107.7} cy={79.5} rx={2.8} ry={1.5} transform="rotate(128 107.7 79.5)" />
            <ellipse cx={15.7} cy={18.2} rx={2.2} ry={2.0} transform="rotate(46 15.7 18.2)" />
            <ellipse cx={87.0} cy={66.8} rx={1.9} ry={1.5} transform="rotate(142 87.0 66.8)" />
            <ellipse cx={57.9} cy={93.2} rx={3.0} ry={0.9} transform="rotate(48 57.9 93.2)" />
            <ellipse cx={53.2} cy={73.5} rx={2.2} ry={1.5} transform="rotate(177 53.2 73.5)" />
            <ellipse cx={33.3} cy={61.0} rx={2.8} ry={1.5} transform="rotate(63 33.3 61.0)" />
            <ellipse cx={107.1} cy={24.3} rx={2.1} ry={1.4} transform="rotate(100 107.1 24.3)" />
            <ellipse cx={53.1} cy={8.7} rx={1.7} ry={0.9} transform="rotate(171 53.1 8.7)" />
            <ellipse cx={79.2} cy={17.2} rx={3.0} ry={2.2} transform="rotate(56 79.2 17.2)" />
            <ellipse cx={89.6} cy={11.3} rx={3.0} ry={1.0} transform="rotate(170 89.6 11.3)" />
            <ellipse cx={50.6} cy={42.8} rx={1.4} ry={1.3} transform="rotate(86 50.6 42.8)" />
            <ellipse cx={66.5} cy={52.9} rx={1.2} ry={1.3} transform="rotate(159 66.5 52.9)" />
          </g>
          <g fill="var(--room-floor-grain)" opacity={0.55}>
            <ellipse cx={38.9} cy={18.1} rx={2.5} ry={0.9} transform="rotate(137 38.9 18.1)" />
            <ellipse cx={14.9} cy={26.8} rx={2.5} ry={2.1} transform="rotate(147 14.9 26.8)" />
            <ellipse cx={21.7} cy={69.8} rx={2.5} ry={1.3} transform="rotate(140 21.7 69.8)" />
            <ellipse cx={29.8} cy={21.6} rx={2.8} ry={0.9} transform="rotate(76 29.8 21.6)" />
            <ellipse cx={50.6} cy={115.4} rx={1.4} ry={1.6} transform="rotate(80 50.6 115.4)" />
            <ellipse cx={87.7} cy={37.2} rx={2.4} ry={1.8} transform="rotate(114 87.7 37.2)" />
            <ellipse cx={15.5} cy={29.7} rx={2.0} ry={2.0} transform="rotate(20 15.5 29.7)" />
            <ellipse cx={114.9} cy={18.1} rx={1.6} ry={1.1} transform="rotate(59 114.9 18.1)" />
            <ellipse cx={103.1} cy={114.0} rx={2.5} ry={1.8} transform="rotate(116 103.1 114.0)" />
            <ellipse cx={8.1} cy={25.1} rx={1.5} ry={1.3} transform="rotate(13 8.1 25.1)" />
            <ellipse cx={114.7} cy={72.3} rx={2.1} ry={1.0} transform="rotate(124 114.7 72.3)" />
            <ellipse cx={2.8} cy={114.1} rx={2.3} ry={1.0} transform="rotate(139 2.8 114.1)" />
            <ellipse cx={63.9} cy={93.5} rx={1.9} ry={1.1} transform="rotate(49 63.9 93.5)" />
            <ellipse cx={31.1} cy={83.1} rx={3.1} ry={1.4} transform="rotate(89 31.1 83.1)" />
            <ellipse cx={57.5} cy={78.4} rx={2.8} ry={0.9} transform="rotate(169 57.5 78.4)" />
            <ellipse cx={55.6} cy={89.2} rx={1.4} ry={1.0} transform="rotate(32 55.6 89.2)" />
            <ellipse cx={65.8} cy={2.6} rx={2.8} ry={1.8} transform="rotate(26 65.8 2.6)" />
            <ellipse cx={31.1} cy={50.3} rx={1.5} ry={2.1} transform="rotate(90 31.1 50.3)" />
            <ellipse cx={73.0} cy={93.1} rx={1.5} ry={1.0} transform="rotate(158 73.0 93.1)" />
            <ellipse cx={33.2} cy={92.7} rx={2.2} ry={1.6} transform="rotate(16 33.2 92.7)" />
            <ellipse cx={83.9} cy={105.2} rx={3.1} ry={1.2} transform="rotate(143 83.9 105.2)" />
            <ellipse cx={36.3} cy={14.7} rx={2.8} ry={2.1} transform="rotate(164 36.3 14.7)" />
            <ellipse cx={99.9} cy={19.4} rx={2.1} ry={1.5} transform="rotate(86 99.9 19.4)" />
            <ellipse cx={35.5} cy={115.3} rx={1.4} ry={2.1} transform="rotate(58 35.5 115.3)" />
          </g>
          <path d="M 0 0.5 H 120 M 0.5 0 V 120" stroke="var(--room-floor-seam)" strokeWidth={1} opacity={0.35} fill="none" />
        </pattern>
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
          <stop offset="0%" stopColor="#e3b27e" />
          <stop offset="45%" stopColor="#c8955c" />
          <stop offset="100%" stopColor="#a9713f" />
        </linearGradient>
        <linearGradient id="window-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--room-window-glass-a)" />
          <stop offset="100%" stopColor="var(--room-window-glass-b)" />
        </linearGradient>
        <filter id="table-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.15" />
        </filter>
        {SEAT_GRADIENT_KEYS.map((key) => (
          <radialGradient key={key} id={`seat-sphere-${key}`} cx="35%" cy="28%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.85} />
            <stop offset="45%" stopColor={`var(--seat-${key})`} />
            <stop offset="100%" stopColor={`var(--seat-${key})`} stopOpacity={0.88} />
          </radialGradient>
        ))}
      </defs>

      {/* Floor */}
      <rect x={4} y={4} width={width - 8} height={height - 8} rx={28} fill="url(#floor-parquet)" />
      <rect x={4} y={4} width={width - 8} height={height - 8} rx={28} fill="url(#room-light-pool)" style={{ mixBlendMode: "soft-light" }} aria-hidden="true" />
      {/* Central aisle runner between the two table columns */}
      <rect x={width / 2 - 70} y={260} width={140} height={height - 520} rx={40} fill="var(--room-aisle)" opacity={0.3} aria-hidden="true" />

      {/* Walls */}
      <rect
        x={4}
        y={4}
        width={width - 8}
        height={height - 8}
        rx={28}
        fill="none"
        stroke="var(--room-wall)"
        strokeWidth={10}
      />

      {/* Glass window strip along the back (top) wall, with frame mullions. */}
      <g aria-hidden="true">
        <rect x={70} y={8} width={width - 140} height={68} rx={8} fill="url(#window-glass)" stroke="var(--room-window-frame)" strokeWidth={4} />
        {Array.from({ length: 7 }, (_, i) => {
          const paneWidth = (width - 140) / 8;
          const x = 70 + (i + 1) * paneWidth;
          return <line key={i} x1={x} y1={10} x2={x} y2={74} stroke="var(--room-window-frame)" strokeWidth={3} />;
        })}
      </g>
      <RoomLabelPill x={width / 2} y={46} text="Ventanas" />

      {/* Long planter box under the windows, with a leafy row. */}
      <g aria-hidden="true">
        <rect x={100} y={82} width={width - 200} height={22} rx={8} fill="var(--room-planter)" />
        <rect x={100} y={82} width={width - 200} height={7} rx={4} fill="var(--room-planter-soil)" opacity={0.6} />
      </g>
      {Array.from({ length: 7 }, (_, i) => {
        const gap = (width - 260) / 6;
        return <Plant key={`window-plant-${i}`} x={130 + i * gap} y={82} scale={0.65} />;
      })}

      {/* Entrance glass doors at the bottom wall. */}
      <g aria-hidden="true">
        <rect x={width / 2 - 90} y={height - 14} width={180} height={20} fill="var(--room-floor-a)" />
        <rect x={width / 2 - 84} y={height - 72} width={78} height={64} rx={6} fill="url(#window-glass)" stroke="var(--room-window-frame)" strokeWidth={4} />
        <rect x={width / 2 + 6} y={height - 72} width={78} height={64} rx={6} fill="url(#window-glass)" stroke="var(--room-window-frame)" strokeWidth={4} />
        <line x1={width / 2} y1={height - 72} x2={width / 2} y2={height - 8} stroke="var(--room-window-frame)" strokeWidth={4} />
      </g>
      <RoomLabelPill x={width / 2} y={height - 34} text="Entrada" />

      {/* Planters with leafy plants along the side walls, between the wall-bar corners. */}
      {wallBars.map((bar) => {
        const nearWallX = bar.x < width / 2 ? 18 : width - 18;
        const midY = bar.y + bar.height / 2;
        return <Plant key={`bar-plant-${bar.id}`} x={nearWallX} y={midY} scale={0.85} />;
      })}
      {AISLE_PLANTS.map((p, i) => (
        <Plant key={`aisle-plant-${i}`} x={p.x} y={p.y} />
      ))}
    </>
  );
});

function RoomLabelPill({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * 13 + 44;
  return (
    <g aria-hidden="true">
      <rect x={x - w / 2} y={y - 21} width={w} height={42} rx={21} fill="white" stroke="var(--border)" strokeWidth={1} opacity={0.95} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={600} className="font-display" fill="#0F172A">
        {text}
      </text>
    </g>
  );
}

function Plant({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const leaves = [
    { dx: 0, dy: -18, rx: 10, ry: 16, rot: 0 },
    { dx: -14, dy: -8, rx: 9, ry: 15, rot: -35 },
    { dx: 14, dy: -8, rx: 9, ry: 15, rot: 35 },
    { dx: -8, dy: -20, rx: 8, ry: 14, rot: -15 },
    { dx: 8, dy: -20, rx: 8, ry: 14, rot: 15 },
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true">
      <ellipse cx={0} cy={14} rx={16} ry={5} fill="black" opacity={0.08} />
      <path d="M -14 10 L -10 -6 L 10 -6 L 14 10 Z" fill="#B07A45" opacity={0.9} />
      {leaves.map((leaf, i) => (
        <ellipse
          key={i}
          cx={leaf.dx}
          cy={leaf.dy}
          rx={leaf.rx}
          ry={leaf.ry}
          fill={i % 2 === 0 ? "#4C8C5B" : "#5FA36C"}
          transform={`rotate(${leaf.rot} ${leaf.dx} ${leaf.dy})`}
        />
      ))}
    </g>
  );
}
