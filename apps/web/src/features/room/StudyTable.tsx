import type { TableDto } from "@uns/contracts";

export function StudyTable({ table }: { table: TableDto }) {
  const cx = table.x + table.width / 2;
  const cy = table.y + table.height / 2;

  return (
    <g transform={`rotate(${table.rotation} ${cx} ${cy})`}>
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
