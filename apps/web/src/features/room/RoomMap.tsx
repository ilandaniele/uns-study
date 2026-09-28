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

// Plant positions, in corners/aisle ends the tables never reach. Purely decorative.
const PLANTS = [
  { x: 60, y: 90 },
  { x: 940, y: 90 },
  { x: 60, y: 1510 },
  { x: 940, y: 1510 },
  { x: 500, y: 150 },
  { x: 500, y: 1450 },
];

export function RoomMap({ map, mySeatId, selectedSeatId, onSelectSeat, highlightTableCode = null }: RoomMapProps) {
  const { width, height } = map.viewBox;
  const tableById = useMemo(() => new Map(map.tables.map((table) => [table.id, table])), [map.tables]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      role="img"
      aria-label={`Mapa de ${map.room.name}`}
    >
      <defs>
        <pattern id="floor-tiles" width={50} height={50} patternUnits="userSpaceOnUse">
          <rect width={50} height={50} fill="var(--room-floor)" />
          <rect width={50} height={50} fill="none" stroke="var(--room-floor-grout)" strokeWidth={1.5} />
        </pattern>
        <linearGradient id="wood-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C8955C" />
          <stop offset="100%" stopColor="#B07A45" />
        </linearGradient>
        <filter id="table-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.15" />
        </filter>
      </defs>

      {/* Floor */}
      <rect x={4} y={4} width={width - 8} height={height - 8} rx={28} fill="url(#floor-tiles)" />
      {/* Central aisle runner between the two table columns */}
      <rect x={width / 2 - 70} y={260} width={140} height={height - 520} rx={40} fill="var(--room-aisle)" opacity={0.35} aria-hidden="true" />

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

      {/* Windows along the back (top) wall */}
      <g aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => {
          const paneWidth = (width - 160) / 8;
          const x = 80 + i * paneWidth + 6;
          return (
            <rect
              key={i}
              x={x}
              y={10}
              width={paneWidth - 12}
              height={22}
              rx={3}
              fill="var(--room-window)"
              stroke="var(--room-window-frame)"
              strokeWidth={2}
            />
          );
        })}
      </g>
      <RoomLabelPill x={width / 2} y={44} text="Ventanas" />

      {/* Entrance gap at the bottom wall, with a door swing arc */}
      <g aria-hidden="true">
        <rect x={width / 2 - 90} y={height - 14} width={180} height={20} fill="var(--room-floor)" />
        <path
          d={`M ${width / 2 - 90} ${height - 10} A 90 90 0 0 1 ${width / 2} ${height - 100}`}
          fill="none"
          stroke="var(--room-wall)"
          strokeWidth={2}
          strokeDasharray="4 4"
          opacity={0.5}
        />
        <line x1={width / 2 - 90} y1={height - 10} x2={width / 2} y2={height - 100} stroke="var(--room-wall)" strokeWidth={2} opacity={0.5} />
      </g>
      <RoomLabelPill x={width / 2} y={height - 34} text="Entrada" />

      {/* Plants */}
      {PLANTS.map((p, i) => (
        <Plant key={i} x={p.x} y={p.y} />
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

function Plant({ x, y }: { x: number; y: number }) {
  const leaves = [
    { dx: 0, dy: -18, rx: 10, ry: 16, rot: 0 },
    { dx: -14, dy: -8, rx: 9, ry: 15, rot: -35 },
    { dx: 14, dy: -8, rx: 9, ry: 15, rot: 35 },
    { dx: -8, dy: -20, rx: 8, ry: 14, rot: -15 },
    { dx: 8, dy: -20, rx: 8, ry: 14, rot: 15 },
  ];
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
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
