import type { RoomSummary } from "@uns/contracts";

export function SummaryCounters({ summary }: { summary: RoomSummary }) {
  const cards: { label: string; value: number; className: string }[] = [
    { label: "Libres", value: summary.free, className: "text-green-600" },
    { label: "Ocupados", value: summary.occupied, className: "text-red-600" },
    { label: "Dudosos", value: summary.uncertain, className: "text-amber-600" },
    { label: "Sin datos", value: summary.unknown, className: "text-slate-500" },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 md:grid-cols-2">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
          <div className={`text-xl font-bold ${card.className}`}>{card.value}</div>
          <div className="text-xs text-slate-500">{card.label}</div>
        </div>
      ))}
      <div className="col-span-4 mt-1 text-center text-xs text-slate-500 md:col-span-2">
        {summary.total} lugares en total
      </div>
    </div>
  );
}
