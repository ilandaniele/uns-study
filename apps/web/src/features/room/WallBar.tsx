import type { TableDto } from "@uns/contracts";

export interface WallBarProps {
  table: TableDto;
}

/** Wood counter strip against a side wall. Its human name shows in the seat detail panel. */
export function WallBar({ table }: WallBarProps) {
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

    </g>
  );
}
