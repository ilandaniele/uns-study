"use client";

import type { SeatDto, TableDto } from "@sala/contracts";

export interface TableLocatorProps {
  table: TableDto | null;
  /** Every seat at `table`, in any order. */
  seats: SeatDto[];
  selectedSeatId: string;
  mySeatId: string | null;
  /** Tapping another chair in the diagram switches the detail to that seat. */
  onSelectSeat?: (seatId: string) => void;
}

const STATUS_COLOR: Record<SeatDto["status"], string> = {
  FREE: "var(--seat-free)",
  OCCUPIED: "var(--seat-occupied)",
  UNCERTAIN: "var(--seat-uncertain)",
  SAVED: "var(--seat-saved)",
  UNKNOWN: "var(--seat-unknown)",
};

const CHAIR = 34;
const PAD = 12;

/**
 * Small top-down drawing of the selected seat's table (same coordinates as the room map) with the
 * chosen chair highlighted, so the seat stays identifiable even when the sheet covers it on the map.
 */
export function TableLocator({ table, seats, selectedSeatId, mySeatId, onSelectSeat }: TableLocatorProps) {
  if (seats.length === 0) return null;
  const xs = seats.map((seat) => seat.x);
  const ys = seats.map((seat) => seat.y);
  if (table) {
    xs.push(table.x, table.x + table.width);
    ys.push(table.y, table.y + table.height);
  }
  const minX = Math.min(...xs) - CHAIR / 2 - PAD;
  const minY = Math.min(...ys) - CHAIR / 2 - PAD;
  const width = Math.max(...xs) + CHAIR / 2 + PAD - minX;
  const height = Math.max(...ys) + CHAIR / 2 + PAD - minY;
  const ordered = [...seats].sort((a, b) => a.seatNumber - b.seatNumber);

  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      className="block h-[68px] w-auto max-w-[128px]"
      role="group"
      aria-label="Ubicación del lugar en la mesa"
    >
      {table ? (
        <rect
          x={table.x}
          y={table.y}
          width={table.width}
          height={table.height}
          rx={10}
          fill="var(--surface)"
          stroke="var(--border-strong)"
          strokeWidth={3}
          transform={`rotate(${table.rotation} ${table.x + table.width / 2} ${table.y + table.height / 2})`}
        />
      ) : null}
      {ordered.map((seat) => {
        const selected = seat.id === selectedSeatId;
        const color = seat.id === mySeatId ? "var(--seat-mine)" : STATUS_COLOR[seat.status];
        const size = selected ? CHAIR + 8 : CHAIR;
        return (
          <g
            key={seat.id}
            role={onSelectSeat && !selected ? "button" : undefined}
            tabIndex={onSelectSeat && !selected ? 0 : undefined}
            aria-label={selected ? undefined : `Ver lugar ${seat.seatNumber}`}
            className={onSelectSeat && !selected ? "cursor-pointer" : undefined}
            onClick={onSelectSeat && !selected ? () => onSelectSeat(seat.id) : undefined}
            onKeyDown={
              onSelectSeat && !selected
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectSeat(seat.id);
                    }
                  }
                : undefined
            }
          >
            {selected ? (
              <rect
                x={seat.x - size / 2 - 7}
                y={seat.y - size / 2 - 7}
                width={size + 14}
                height={size + 14}
                rx={12}
                fill="none"
                stroke="var(--text)"
                strokeWidth={5}
              />
            ) : null}
            <rect
              x={seat.x - size / 2}
              y={seat.y - size / 2}
              width={size}
              height={size}
              rx={8}
              fill={color}
              opacity={selected ? 1 : 0.45}
            />
            {selected ? (
              <text
                x={seat.x}
                y={seat.y + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={24}
                fontWeight={800}
                fill={seat.status === "SAVED" && seat.id !== mySeatId ? "#422006" : "white"}
              >
                {seat.seatNumber}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
