import type { RoomSummary } from "@uns/contracts";

const TILES: { key: keyof RoomSummary; label: string; color: string }[] = [
  { key: "free", label: "Libres", color: "var(--seat-free)" },
  { key: "occupied", label: "Ocupados", color: "var(--seat-occupied)" },
  { key: "saved", label: "Guardados", color: "var(--seat-saved)" },
  { key: "uncertain", label: "Dudosos", color: "var(--seat-uncertain)" },
  { key: "unknown", label: "Sin datos", color: "var(--seat-unknown)" },
];

/** Five tinted count tiles (Libres/Ocupados/Guardados/Dudosos/Sin datos) plus the total, per the room mockup. */
export function SummaryCounters({ summary }: { summary: RoomSummary }) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-2">
        {TILES.map((tile) => (
          <div
            key={tile.key}
            className="rounded-2xl px-2 py-3 text-center"
            style={{ backgroundColor: `color-mix(in srgb, ${tile.color} 12%, transparent)` }}
          >
            <p className="text-xl font-bold sm:text-2xl" style={{ color: tile.color }}>
              {summary[tile.key] as number}
            </p>
            <p className="mt-0.5 text-xs font-medium text-muted">{tile.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
