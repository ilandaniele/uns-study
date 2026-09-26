"use client";

import type { RoomMapDto, SeatDto } from "@uns/contracts";
import { useMemo } from "react";
import { Seat } from "./Seat";
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

export function RoomMap({ map, mySeatId, selectedSeatId, onSelectSeat, highlightTableCode = null }: RoomMapProps) {
  const tableById = useMemo(() => new Map(map.tables.map((table) => [table.id, table])), [map.tables]);

  return (
    <svg
      viewBox={`0 0 ${map.viewBox.width} ${map.viewBox.height}`}
      className="h-full w-full"
      role="img"
      aria-label={`Mapa de ${map.room.name}`}
    >
      <rect x={4} y={4} width={map.viewBox.width - 8} height={map.viewBox.height - 8} rx={24} fill="#fdfaf4" stroke="#d8cdb8" strokeWidth={4} />

      <text x={map.viewBox.width / 2} y={40} textAnchor="middle" fontSize={22} fontWeight={700} fill="#5b6b7c" letterSpacing={4}>
        VENTANAS
      </text>
      <text x={map.viewBox.width / 2} y={map.viewBox.height - 20} textAnchor="middle" fontSize={22} fontWeight={700} fill="#5b6b7c" letterSpacing={4}>
        ENTRADA
      </text>

      {map.tables.map((table) =>
        table.type === "WALL_BAR" ? (
          <WallBar key={table.id} table={table} />
        ) : (
          <StudyTable key={table.id} table={table} highlighted={highlightTableCode !== null && table.code === highlightTableCode} />
        ),
      )}

      {map.seats.map((seat) => {
        const table = tableById.get(seat.tableId);
        return (
          <Seat
            key={seat.id}
            seat={seat}
            tableLabel={table?.label ?? seat.code}
            tableType={table?.type ?? "MAIN_TABLE"}
            isMySeat={seat.id === mySeatId}
            isSelected={seat.id === selectedSeatId}
            onSelect={onSelectSeat}
          />
        );
      })}
    </svg>
  );
}
