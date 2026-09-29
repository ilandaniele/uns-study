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

/** Light natural-oak main table, drawn top-down, with a small rounded pill carrying the table's name —
 *  its community nickname when it has one, else "Mesa N" (see `tableDisplayName`). */
export const StudyTable = memo(function StudyTable({ table, highlighted = false }: StudyTableProps) {
  const cx = table.x + table.width / 2;
  const cy = table.y + table.height / 2;
  const fullName = table.nickname ?? tableDisplayName(table, table.code);
  const pillText = truncatePillText(fullName);
  // "Mesa 12" must read as large as "Mesa 1": only long community nicknames drop to the small size.
  // Small pill sitting on the white centre strip: "Mesa 12" reads the same as "Mesa 1", long nicknames shrink.
  const pillFontSize = pillText.length > 8 ? 11 : 13;
  const pillWidth = Math.max(50, 14 + pillText.length * pillFontSize * 0.58);
  const pillHeight = 18;
  // Divider / power strip running lengthwise down the middle of the table.
  const horizontal = table.width >= table.height;
  const stripThickness = 22;
  const strip = horizontal
    ? { x: table.x + 12, y: cy - stripThickness / 2, width: table.width - 24, height: stripThickness }
    : { x: cx - stripThickness / 2, y: table.y + 12, width: stripThickness, height: table.height - 24 };

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
        stroke="var(--room-table-border)"
        strokeWidth={1.5}
      />
      {/* Subtle edge shadow just inside the tabletop rim. */}
      <rect
        x={table.x + 2}
        y={table.y + 2}
        width={table.width - 4}
        height={table.height - 4}
        rx={9}
        fill="none"
        stroke="black"
        strokeOpacity={0.1}
        strokeWidth={3}
      />
      {/* Raised white / light-grey centre strip. */}
      <rect x={strip.x} y={strip.y + 1.5} width={strip.width} height={strip.height} rx={4} fill="black" opacity={0.14} />
      <rect x={strip.x} y={strip.y} width={strip.width} height={strip.height} rx={4} fill="var(--room-table-strip)" stroke="var(--room-table-strip-edge)" strokeWidth={1} />
      <title>{fullName}</title>
      <rect
        x={cx - pillWidth / 2}
        y={cy - pillHeight / 2}
        width={pillWidth}
        height={pillHeight}
        rx={9}
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
