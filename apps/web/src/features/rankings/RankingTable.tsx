import type { RankingDto } from "@uns/contracts";
import { formatRankingValue } from "./labels";

export function RankingTable({ ranking }: { ranking: RankingDto }) {
  if (ranking.entries.length === 0) {
    return <p className="p-4 text-sm text-slate-500">Todavía no hay datos para este período.</p>;
  }

  const meInTop = ranking.me ? ranking.entries.some((entry) => entry.userId === ranking.me?.userId) : true;

  return (
    <div className="flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
      {ranking.entries.map((entry) => (
        <RankingRow key={entry.userId} rank={entry.rank} name={entry.displayName} avatarUrl={entry.avatarUrl}
          value={formatRankingValue(ranking.category, entry.value)}
          highlighted={ranking.me?.userId === entry.userId} />
      ))}
      {!meInTop && ranking.me ? (
        <RankingRow
          rank={ranking.me.rank}
          name={ranking.me.displayName}
          avatarUrl={ranking.me.avatarUrl}
          value={formatRankingValue(ranking.category, ranking.me.value)}
          highlighted
        />
      ) : null}
    </div>
  );
}

function RankingRow({
  rank,
  name,
  avatarUrl,
  value,
  highlighted,
}: {
  rank: number;
  name: string;
  avatarUrl: string | null;
  value: string;
  highlighted?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${highlighted ? "bg-primary/5" : ""}`}>
      <span className="w-6 text-right font-mono text-sm font-semibold text-slate-400">{rank}</span>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- small avatar thumbnails, not worth next/image config here
        <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-500">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="flex-1 truncate text-sm font-medium text-slate-800">{name}</span>
      <span className="font-mono text-sm font-semibold text-slate-700">{value}</span>
    </div>
  );
}
