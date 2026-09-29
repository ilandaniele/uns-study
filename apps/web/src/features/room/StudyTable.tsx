import type { TableDto } from "@uns/contracts";
import { memo } from "react";
import { tableDisplayName } from "./format";

export interface StudyTableProps {
  table: TableDto;
  /** When true (table reached via a scanned QR code), draws a highlight ring around it. */
  highlighted?: boolean;
}

/** Pill text over ~14 chars is truncated with an ellipsis; the full text still lives in `title`/`aria-label`. */
const MAX_PILL_CHARS = 14;

function truncatePillText(text: string): string {
  return text.length > MAX_PILL_CHARS ? `${text.slice(0, MAX_PILL_CHARS - 1)}…` : text;
}

/** Warm wood main table, drawn top-down, with a small rounded pill carrying the table's name —
 *  its community nickname when it has one, else "Mesa N" (see `tableDisplayName`). */
export const StudyTable = memo(function StudyTable({ table, highlighted = false }: StudyTableProps) {
  const cx = table.x + table.width / 2;
  const cy = table.y + table.height / 2;
  const fullName = table.nickname ?? tableDisplayName(table, table.code);
  const pillText = truncatePillText(fullName);
  // "Mesa 12" must read as large as "Mesa 1": only long community nicknames drop to the small size.
  const pillFontSize = pillText.length > 8 ? 17 : 22;
  const pillWidth = Math.max(84, 24 + pillText.length * pillFontSize * 0.56);
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
      <title>{fullName}</title>
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
        fontSize={pillFontSize}
        fontWeight={700}
        className="font-display"
        fill="var(--room-table-label-text)"
      >
        {pillText}
      </text>
    </g>
  );
});
