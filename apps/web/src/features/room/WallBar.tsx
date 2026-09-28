import type { TableDto } from "@uns/contracts";
import { tableDisplayName } from "./format";

export interface WallBarProps {
  table: TableDto;
  /** Number of seats at this bar, shown on its label card ("(3 lugares)"). */
  seatCount: number;
}

/**
 * Wood counter strip against a side wall, topped by a small rounded white label card carrying
 * its human name ("Barra fondo izquierda") and seat count. The card always floats above the
 * bar's own footprint so it never covers a seat, on either corner.
 */
export function WallBar({ table, seatCount }: WallBarProps) {
  const line1 = tableDisplayName(table, table.code);
  const line2 = `(${seatCount} ${seatCount === 1 ? "lugar" : "lugares"})`;
  const cardWidth = Math.max(line1.length, line2.length) * 7.4 + 28;
  const cardHeight = 46;
  const cardCx = table.x + table.width / 2;
  const cardCy = table.y - 26;

  return (
    <g>
      <rect
        x={table.x}
        y={table.y + 3}
        width={table.width}
        height={table.height}
        rx={10}
        fill="black"
        opacity={0.12}
        filter="url(#table-shadow)"
      />
      <rect
        x={table.x}
        y={table.y}
        width={table.width}
        height={table.height}
        rx={10}
        fill="url(#wood-gradient)"
        stroke="var(--room-bar-border)"
        strokeWidth={1.5}
      />
      <rect
        x={table.x + 3}
        y={table.y + 3}
        width={table.width - 6}
        height={table.height * 0.12}
        rx={5}
        fill="white"
        opacity={0.14}
        aria-hidden="true"
      />

      <g aria-hidden="true">
        <rect
          x={cardCx - cardWidth / 2}
          y={cardCy - cardHeight / 2}
          width={cardWidth}
          height={cardHeight}
          rx={12}
          fill="var(--room-bar-label-bg)"
          stroke="var(--border)"
          strokeWidth={1}
          opacity={0.96}
        />
        <text
          x={cardCx}
          y={cardCy - 8}
          textAnchor="middle"
          fontSize={13}
          fontWeight={700}
          className="font-display"
          fill="var(--room-bar-label-text)"
        >
          {line1}
        </text>
        <text x={cardCx} y={cardCy + 11} textAnchor="middle" fontSize={12} fill="var(--room-label)">
          {line2}
        </text>
      </g>
    </g>
  );
}
