import type { TableDto } from "@uns/contracts";

export interface StudyTableProps {
  table: TableDto;
  /** When true (table reached via a scanned QR code), draws a highlight ring around it. */
  highlighted?: boolean;
}

/** Warm wood main table, drawn top-down, with a small rounded pill carrying the table code. */
export function StudyTable({ table, highlighted = false }: StudyTableProps) {
  const cx = table.x + table.width / 2;
  const cy = table.y + table.height / 2;
  const pillWidth = 84;
  const pillHeight = 38;

  return (
    <g transform={`rotate(${table.rotation} ${cx} ${cy})`}>
      {highlighted ? (
        <rect
          x={table.x - 6}
          y={table.y - 6}
          width={table.width + 12}
          height={table.height + 12}
          rx={20}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={3}
          strokeDasharray="6 4"
        />
      ) : null}
      <rect
        x={table.x}
        y={table.y + 3}
        width={table.width}
        height={table.height}
        rx={18}
        fill="black"
        opacity={0.12}
        filter="url(#table-shadow)"
      />
      <rect
        x={table.x}
        y={table.y}
        width={table.width}
        height={table.height}
        rx={18}
        fill="url(#wood-gradient)"
        stroke="var(--room-table-border)"
        strokeWidth={1.5}
      />
      {/* Sheen: a soft light band across the top third, like a tabletop catching the window light. */}
      <rect
        x={table.x + 8}
        y={table.y + 5}
        width={table.width - 16}
        height={table.height * 0.32}
        rx={12}
        fill="white"
        opacity={0.14}
      />
      <rect
        x={cx - pillWidth / 2}
        y={cy - pillHeight / 2}
        width={pillWidth}
        height={pillHeight}
        rx={19}
        fill="var(--room-table-label-bg)"
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={24}
        fontWeight={700}
        className="font-display"
        fill="var(--room-table-label-text)"
      >
        {table.label}
      </text>
    </g>
  );
}
