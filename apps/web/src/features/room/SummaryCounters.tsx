import type { RoomSummary } from "@sala/contracts";

// `glyph` mirrors the letter drawn on the map seats (Seat.tsx) so color is never the only signal.
const TILES: { key: keyof RoomSummary; label: string; color: string; glyph: string; glyphColor: string }[] = [
  { key: "free", label: "Libres", color: "var(--seat-free)", glyph: "L", glyphColor: "var(--seat-glyph)" },
  { key: "occupied", label: "Ocupados", color: "var(--seat-occupied)", glyph: "O", glyphColor: "var(--seat-glyph)" },
  { key: "saved", label: "Guardados", color: "var(--seat-saved)", glyph: "G", glyphColor: "var(--seat-glyph-saved)" },
  { key: "uncertain", label: "Dudosos", color: "var(--seat-uncertain)", glyph: "?", glyphColor: "var(--seat-glyph)" },
  { key: "unknown", label: "Sin datos", color: "var(--seat-unknown)", glyph: "-", glyphColor: "var(--seat-glyph)" },
];

/**
 * The room's status board: one plate with a column per state (Libres/Ocupados/Guardados/Dudosos/
 * Sin datos), a colored swatch above each figure (tabular numerals), plus a proportional strip below
 * so the mix of the whole room reads at a glance.
 */
export function SummaryCounters({ summary }: { summary: RoomSummary }) {
  const total = TILES.reduce((acc, tile) => acc + (summary[tile.key] as number), 0);
  return (
    <div className="overflow-hidden rounded-xl border border-app bg-surface">
      <dl className="grid grid-cols-5 divide-x divide-[var(--border)]">
        {TILES.map((tile) => (
          <div key={tile.key} className="flex flex-col-reverse items-center px-1 pb-2.5 pt-2.5">
            <dt className="mt-1.5 text-[11px] font-semibold leading-tight text-muted">{tile.label}</dt>
            <dd className="font-mono text-[22px] font-semibold leading-none text-main sm:text-2xl">{summary[tile.key] as number}</dd>
            <span
              aria-hidden="true"
              className="mb-1.5 grid h-4 w-4 place-items-center rounded-[3px] text-[10px] font-bold leading-none"
              style={{ backgroundColor: tile.color, color: tile.glyphColor }}
            >
              {tile.glyph}
            </span>
          </div>
        ))}
      </dl>
      {total > 0 ? (
        <div aria-hidden="true" className="relative h-1.5 w-full overflow-hidden bg-[var(--surface-2)]">
          {/* Stacked bar drawn as layers scaled to each status's cumulative share, so changes
              animate on transform only. Earlier statuses paint on top of later ones. */}
          {TILES.map((tile, index) => {
            const cumulative = TILES.slice(0, index + 1).reduce((sum, t) => sum + (summary[t.key] as number), 0);
            return (
              <span
                key={tile.key}
                className="occupancy-segment absolute inset-0"
                style={{ transform: `scaleX(${cumulative / total})`, backgroundColor: tile.color, zIndex: TILES.length - index }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
