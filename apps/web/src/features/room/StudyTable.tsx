import type { TableDto } from "@uns/contracts";

export interface StudyTableProps {
  table: TableDto;
  /** When true (table reached via a scanned QR code), draws a highlight ring around it. */
  highlighted?: boolean;
}

export function StudyTable({ table, highlighted = false }: StudyTableProps) {
  const cx = table.x + table.width / 2;
  const cy = table.y + table.height / 2;

  return (
    <g transform={`rotate(${table.rotation} ${cx} ${cy})`}>
      {highlighted ? (
        <rect
          x={table.x - 6}
          y={table.y - 6}
          width={table.width + 12}
          height={table.height + 12}
          rx={14}
          fill="none"
          stroke="#2563eb"
          strokeWidth={3}
          strokeDasharray="6 4"
        />
      ) : null}
      <rect
        x={table.x}
        y={table.y}
        width={table.width}
        height={table.height}
        rx={10}
        fill="#e7d3b0"
        stroke="#b08a55"
        strokeWidth={1.5}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={20} fontWeight={700} fill="#5b4326">
        {table.label}
      </text>
    </g>
  );
}
