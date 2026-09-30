import type { RoomSummary } from "@uns/contracts";

const TILES: { key: keyof RoomSummary; label: string; color: string }[] = [
  { key: "free", label: "Libres", color: "var(--seat-free)" },
  { key: "occupied", label: "Ocupados", color: "var(--seat-occupied)" },
  { key: "saved", label: "Guardados", color: "var(--seat-saved)" },
  { key: "uncertain", label: "Dudosos", color: "var(--seat-uncertain)" },
  { key: "unknown", label: "Sin datos", color: "var(--seat-unknown)" },
];

/**
 * The room's status board: one plate with a column per state (Libres/Ocupados/Guardados/Dudosos/
 * Sin datos), a colored tick on top of each and tabular figures, plus a proportional strip below
 * so the mix of the whole room reads at a glance.
 */
export function SummaryCounters({ summary }: { summary: RoomSummary }) {
  const total = TILES.reduce((acc, tile) => acc + (summary[tile.key] as number), 0);
  return (
    <div className="overflow-hidden rounded-xl border border-app bg-surface">
      <dl className="grid grid-cols-5 divide-x divide-[var(--border)]">
        {TILES.map((tile) => (
          <div key={tile.key} className="relative flex flex-col items-center px-1 pb-2.5 pt-3">
            <span aria-hidden="true" className="absolute inset-x-2 top-0 h-[3px] rounded-b-sm" style={{ backgroundColor: tile.color }} />
            <dd className="font-mono text-[22px] font-semibold leading-none text-main sm:text-2xl">{summary[tile.key] as number}</dd>
            <dt className="mt-1.5 text-[11px] font-semibold leading-tight text-muted">{tile.label}</dt>
          </div>
        ))}
      </dl>
      {total > 0 ? (
        <div aria-hidden="true" className="flex h-1.5 w-full bg-[var(--surface-2)]">
          {TILES.map((tile) => {
            const value = summary[tile.key] as number;
            if (value === 0) return null;
            return (
              <span
                key={tile.key}
                className="occupancy-segment h-full"
                style={{ width: `${(value / total) * 100}%`, backgroundColor: tile.color }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
