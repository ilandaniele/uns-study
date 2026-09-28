"use client";

import type { RoomMapDto, SeatDto } from "@uns/contracts";
import { useMemo } from "react";
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
}

// Seat status keys that get a shared radial-gradient "glossy sphere" fill, defined once below
// and referenced by id from Seat.tsx — avoids per-seat gradients/filters across 108 seats.
const SEAT_GRADIENT_KEYS = ["free", "occupied", "uncertain", "unknown", "mine"] as const;

// Plants dotted along the central aisle, near the windows and near the entrance. Purely decorative.
const AISLE_PLANTS = [
  { x: 400, y: 150 },
  { x: 600, y: 1450 },
];

export function RoomMap({ map, mySeatId, selectedSeatId, onSelectSeat, highlightTableCode = null }: RoomMapProps) {
  const { width, height } = map.viewBox;
  const tableById = useMemo(() => new Map(map.tables.map((table) => [table.id, table])), [map.tables]);
  const wallBars = useMemo(() => map.tables.filter((table) => table.type === "WALL_BAR"), [map.tables]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      role="img"
      aria-label={`Mapa de ${map.room.name}`}
    >
      <defs>
        {/* Warm terracotta parquet floor: two plank tones in a basket-weave offset, plus faint grain lines. */}
        <pattern id="floor-parquet" width={240} height={96} patternUnits="userSpaceOnUse">
          <rect width={240} height={96} fill="var(--room-floor-a)" />
          {/* Staggered long planks, alternating tone slightly, like a real wood floor from above. */}
          <g fill="var(--room-floor-b)" opacity={0.55}>
            <rect x={0} y={0} width={120} height={24} />
            <rect x={60} y={24} width={120} height={24} />
            <rect x={180} y={48} width={60} height={24} />
            <rect x={0} y={48} width={60} height={24} />
            <rect x={120} y={72} width={120} height={24} />
          </g>
          <g stroke="var(--room-floor-grain)" strokeWidth={1} opacity={0.28}>
            <line x1={0} y1={24} x2={240} y2={24} />
            <line x1={0} y1={48} x2={240} y2={48} />
            <line x1={0} y1={72} x2={240} y2={72} />
            <line x1={0} y1={96} x2={240} y2={96} />
            <line x1={120} y1={0} x2={120} y2={24} />
            <line x1={60} y1={24} x2={60} y2={48} />
            <line x1={180} y1={24} x2={180} y2={48} />
            <line x1={0} y1={48} x2={0} y2={72} />
            <line x1={60} y1={48} x2={60} y2={72} />
            <line x1={180} y1={48} x2={180} y2={72} />
            <line x1={120} y1={72} x2={120} y2={96} />
          </g>
          <g stroke="var(--room-floor-grain)" strokeWidth={0.6} opacity={0.14}>
            <path d="M 8 9 Q 60 6 112 11 M 70 36 Q 120 33 170 38 M 10 60 Q 30 58 52 61 M 130 84 Q 180 81 232 86" fill="none" />
          </g>
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

      {map.tables.map((table) =>
        table.type === "WALL_BAR" ? (
          <WallBar key={table.id} table={table} />
        ) : (
          <StudyTable key={table.id} table={table} highlighted={highlightTableCode !== null && table.code === highlightTableCode} />
        ),
      )}

      {map.seats.map((seat) => {
        const table = tableById.get(seat.tableId);
        const facing: SeatFacing = table && seat.y < table.y + table.height / 2 ? "up" : "down";
        return (
          <Seat
            key={seat.id}
            seat={seat}
            tableLabel={table?.label ?? seat.code}
            tableType={table?.type ?? "MAIN_TABLE"}
            facing={facing}
            isMySeat={seat.id === mySeatId}
            isSelected={seat.id === selectedSeatId}
            onSelect={onSelectSeat}
          />
        );
      })}

      {/* Photo-style vignette on top of everything, then a dark-mode dimmer — the room stays warm, just dimmed. */}
      <rect x={0} y={0} width={width} height={height} fill="url(#room-vignette)" pointerEvents="none" aria-hidden="true" />
      <rect x={0} y={0} width={width} height={height} fill="black" style={{ opacity: "var(--room-dark-overlay)" }} pointerEvents="none" aria-hidden="true" />
    </svg>
  );
}

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
