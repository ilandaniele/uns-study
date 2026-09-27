import type { TableDto } from "@uns/contracts";

export function WallBar({ table }: { table: TableDto }) {
  const cx = table.x + table.width / 2;
  const cy = table.y + table.height / 2;

  return (
    <g transform={`rotate(${table.rotation} ${cx} ${cy})`}>
      <rect
        x={table.x}
        y={table.y}
        width={table.width}
        height={table.height}
        rx={8}
        fill="var(--room-bar-fill)"
        stroke="var(--room-bar-border)"
        strokeWidth={1.5}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={20}
        fontWeight={700}
        fill="var(--room-bar-text)"
        transform={`rotate(90 ${cx} ${cy})`}
      >
        {table.label}
      </text>
    </g>
  );
}
