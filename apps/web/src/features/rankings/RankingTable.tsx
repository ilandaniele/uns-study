import type { RankingDto } from "@uns/contracts";
import { formatRankingValue } from "./labels";

export function RankingTable({ ranking }: { ranking: RankingDto }) {
  if (ranking.entries.length === 0) {
    return <p className="p-4 text-sm text-muted">Todavía no hay datos para este período.</p>;
  }

  const meInTop = ranking.me ? ranking.entries.some((entry) => entry.userId === ranking.me?.userId) : true;

  return (
    <div className="flex flex-col divide-y divide-[var(--border)] rounded-[14px] border border-app bg-surface">
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
  const topThree = rank <= 3;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${highlighted ? "bg-primary/10" : ""}`}>
      <span className={`w-6 text-right font-mono text-sm ${topThree ? "font-bold text-main" : "font-semibold text-muted"}`}>{rank}</span>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- small avatar thumbnails, not worth next/image config here
        <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold text-main">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className={`flex-1 truncate text-sm ${topThree ? "font-semibold text-main" : "font-medium text-main"}`}>{name}</span>
      <span className="font-mono text-sm font-semibold text-main">{value}</span>
    </div>
  );
}
