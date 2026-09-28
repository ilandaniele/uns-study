import type { RoomSummary } from "@uns/contracts";

const SEGMENTS: { key: keyof RoomSummary; label: string; color: string; text: string }[] = [
  { key: "free", label: "Libres", color: "var(--seat-free)", text: "text-[var(--seat-free)]" },
  { key: "occupied", label: "Ocupados", color: "var(--seat-occupied)", text: "text-[var(--seat-occupied)]" },
  { key: "uncertain", label: "Dudosos", color: "var(--seat-uncertain)", text: "text-[var(--seat-uncertain)]" },
  { key: "unknown", label: "Sin datos", color: "var(--seat-unknown)", text: "text-muted" },
];

/** Segmented occupancy bar with an inline legend that doubles as the counters. */
export function SummaryCounters({ summary }: { summary: RoomSummary }) {
  const total = summary.total || 1;

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-2)]" role="img" aria-label="Ocupación de la sala">
        {SEGMENTS.map((segment) => {
          const value = summary[segment.key] as number;
          const pct = (value / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={segment.key}
              className="occupancy-segment h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${pct}%`, backgroundColor: segment.color }}
            />
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className="text-muted">{segment.label}</span>
            <span className={`font-mono font-semibold ${segment.text}`}>{summary[segment.key] as number}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--seat-mine)" }} />
          <span className="text-muted">Tu lugar</span>
        </li>
      </ul>
      <p className="mt-1 font-mono text-xs text-muted">{summary.total} lugares en total</p>
    </div>
  );
}
