import type { RankingDto, RankingEntryDto, RankingPeriod } from "@uns/contracts";
import { TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { emptyRankingMessage, formatRankingValue } from "./labels";

const MEDAL: Record<number, string> = { 1: "#E0A526", 2: "#9AA6B6", 3: "#C07A45" };

export function RankingTable({ ranking }: { ranking: RankingDto }) {
  if (ranking.entries.length === 0) return <EmptyRanking period={ranking.period} />;

  const format = (value: number) => formatRankingValue(ranking.category, value);
  const myId = ranking.me?.userId ?? null;
  const podium = ranking.entries.filter((entry) => entry.rank <= 3).slice(0, 3);
  const rest = ranking.entries.filter((entry) => !podium.includes(entry));
  const meInList = myId === null || ranking.entries.some((entry) => entry.userId === myId);

  return (
    <div className="flex flex-col gap-4">
      <Podium entries={podium} format={format} myId={myId} />
      {rest.length > 0 ? (
        <ol className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-app bg-surface">
          {rest.map((entry) => (
            <RankingRow key={entry.userId} entry={entry} value={format(entry.value)} highlighted={entry.userId === myId} />
          ))}
        </ol>
      ) : null}
      {!meInList && ranking.me ? (
        <div className="sticky bottom-20 md:bottom-4">
          <p className="mb-1.5 px-1 text-xs font-medium text-muted">Tu posición</p>
          <ol className="overflow-hidden rounded-2xl border border-app bg-surface shadow-md">
            <RankingRow entry={ranking.me} value={format(ranking.me.value)} highlighted />
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/** Top three as cards, winner in the middle and raised (2 - 1 - 3). */
function Podium({ entries, format, myId }: { entries: RankingEntryDto[]; format: (value: number) => string; myId: string | null }) {
  const byRank = (rank: number) => entries.find((entry) => entry.rank === rank) ?? null;
  const slots = [byRank(2), byRank(1), byRank(3)];
  return (
    <ol className="grid grid-cols-3 items-end gap-2">
      {slots.map((entry, index) =>
        entry ? (
          <li
            key={entry.userId}
            className={`flex min-w-0 flex-col items-center gap-2 rounded-2xl border px-2 pb-3 text-center ${
              entry.rank === 1 ? "pt-6" : "pt-3"
            } ${entry.userId === myId ? "border-[var(--primary)] bg-primary/10" : "border-app bg-surface"}`}
          >
            <div className="relative">
              <Avatar name={entry.displayName} url={entry.avatarUrl} size={entry.rank === 1 ? 64 : 52} />
              <span
                className="absolute -bottom-1 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-[var(--surface)]"
                style={{ backgroundColor: MEDAL[entry.rank] }}
              >
                {entry.rank}
              </span>
            </div>
            <Link href={`/u/${entry.userId}`} className="mt-1 w-full truncate text-sm font-semibold text-main hover:underline">
              {entry.displayName}
            </Link>
            <span className="text-sm font-semibold tabular-nums text-main">{format(entry.value)}</span>
          </li>
        ) : (
          <li key={`empty-${index}`} aria-hidden="true" />
        ),
      )}
    </ol>
  );
}

function RankingRow({ entry, value, highlighted }: { entry: RankingEntryDto; value: string; highlighted?: boolean }) {
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${highlighted ? "bg-primary/10" : ""}`}>
      <span className="w-7 text-right text-sm font-semibold tabular-nums text-muted">{entry.rank}</span>
      <Avatar name={entry.displayName} url={entry.avatarUrl} size={36} />
      <Link href={`/u/${entry.userId}`} className="min-w-0 flex-1 truncate text-sm font-medium text-main hover:underline">
        {entry.displayName}
        {highlighted ? <span className="ml-1.5 text-xs font-medium text-primary">vos</span> : null}
      </Link>
      <span className="text-sm font-semibold tabular-nums text-main">{value}</span>
    </li>
  );
}

function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- small avatar thumbnails, not worth next/image config here
    return <img src={url} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-[var(--surface-2)] font-semibold text-main"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function EmptyRanking({ period }: { period: RankingPeriod }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-app px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted">
        <TrophyIcon size={28} aria-hidden="true" />
      </span>
      <div>
        <p className="font-display text-base font-semibold text-main">{emptyRankingMessage(period)}</p>
        <p className="mt-1 text-sm text-muted">Marcá “Estoy acá” en tu lugar y empezás a sumar.</p>
      </div>
      <Link href="/sala/principal" className="mt-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-[0.98]">
        Ir a la sala
      </Link>
    </div>
  );
}

export function RankingSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando ranking">
      <div className="grid grid-cols-3 items-end gap-2">
        {[120, 144, 120].map((height, index) => (
          <div key={index} className="animate-pulse rounded-2xl bg-[var(--surface-2)]" style={{ height }} />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
    </div>
  );
}
