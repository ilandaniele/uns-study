import type { RankingDto, RankingEntryDto, RankingPeriod } from "@sala/contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminBadge } from "@/components/AdminBadge";
import { Avatar } from "@/components/Avatar";
import { emptyRankingMessage, formatRankingValue } from "./labels";

const MEDAL: Record<number, string> = { 1: "#E0A526", 2: "#9AA6B6", 3: "#C07A45" };

export function RankingTable({ ranking }: { ranking: RankingDto }) {
  if (ranking.entries.length === 0) return <EmptyRanking period={ranking.period} />;

  const format = (value: number) => formatRankingValue(ranking.category, value);
  const podium = ranking.entries.filter((entry) => entry.rank <= 3).slice(0, 3);
  const rest = ranking.entries.filter((entry) => !podium.includes(entry));
  const meInList = ranking.me === null || ranking.entries.some((entry) => entry.isMe);

  return (
    <div className="flex flex-col gap-4">
      <Podium entries={podium} format={format} />
      {rest.length > 0 ? (
        <ol className="flex flex-col divide-y divide-[var(--border)] border-y border-app">
          {rest.map((entry) => (
            <RankingRow key={entry.userId ?? `anon-${entry.rank}`} entry={entry} value={format(entry.value)} highlighted={entry.isMe} />
          ))}
        </ol>
      ) : null}
      {!meInList && ranking.me ? (
        <div className="sticky bottom-[calc(136px+env(safe-area-inset-bottom))] lg:bottom-[88px]">
          <p className="mb-1.5 px-1 text-xs font-medium text-muted">Tu posición</p>
          <ol className="border-y border-app bg-surface">
            <RankingRow entry={ranking.me} value={format(ranking.me.value)} highlighted />
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/** Top three as cards, winner in the middle and raised (2 - 1 - 3). */
function Podium({ entries, format }: { entries: RankingEntryDto[]; format: (value: number) => string }) {
  const byRank = (rank: number) => entries.find((entry) => entry.rank === rank) ?? null;
  const slots = [byRank(2), byRank(1), byRank(3)];
  return (
    <ol className="grid grid-cols-3 items-end divide-x divide-[var(--border)] border-t border-app">
      {slots.map((entry, index) =>
        entry ? (
          <li
            key={entry.userId ?? `anon-${entry.rank}`}
            className={`flex min-w-0 flex-col items-center gap-2 px-2 pb-3 text-center ${
              entry.rank === 1 ? "pt-7" : "pt-3"
            } ${entry.isMe ? "bg-primary/10" : ""}`}
          >
            <PodiumAvatarLink userId={entry.userId}>
              <Avatar
                userId={entry.userId ?? entry.displayName}
                name={entry.displayName}
                url={entry.avatarUrl}
                aliasAnimal={entry.aliasAnimal}
                size={entry.rank === 1 ? 64 : 52}
                ringColor={MEDAL[entry.rank]}
                proBadge={entry.proBadge}
              />
              {entry.adminBadge ? <AdminBadge size={entry.rank === 1 ? 64 : 52} edge="top" /> : null}
              <span
                className="absolute -bottom-1 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full text-xs font-bold text-[#131816] ring-2 ring-[var(--surface)]"
                style={{ backgroundColor: MEDAL[entry.rank] }}
              >
                {entry.rank}
              </span>
            </PodiumAvatarLink>
            {entry.userId ? (
              <Link
                href={`/u/${entry.userId}`}
                className={`mt-1 w-full truncate text-main hover:underline ${entry.rank === 1 ? "text-sm font-bold" : "text-sm font-semibold"}`}
              >
                {entry.displayName}
              </Link>
            ) : (
              <span className={`mt-1 w-full truncate text-main ${entry.rank === 1 ? "text-sm font-bold" : "text-sm font-semibold"}`}>
                {entry.displayName}
              </span>
            )}
            <span className={`tabular-nums text-main ${entry.rank === 1 ? "text-base font-bold" : "text-sm font-semibold"}`}>
              {format(entry.value)}
            </span>
          </li>
        ) : (
          <li key={`empty-${index}`} aria-hidden="true" />
        ),
      )}
    </ol>
  );
}

/** Podium avatar plus its badges; links to the profile when the entry is a real user. */
function PodiumAvatarLink({ userId, children }: { userId: string | null; children: ReactNode }) {
  if (!userId) return <div className="relative">{children}</div>;
  return (
    <Link href={`/u/${userId}`} aria-hidden="true" tabIndex={-1} className="relative block rounded-full">
      {children}
    </Link>
  );
}

function RankingRow({ entry, value, highlighted }: { entry: RankingEntryDto; value: string; highlighted?: boolean }) {
  const rowAvatar = (
    <Avatar userId={entry.userId ?? entry.displayName} name={entry.displayName} url={entry.avatarUrl} aliasAnimal={entry.aliasAnimal} size={40} adminBadge={entry.adminBadge} proBadge={entry.proBadge} />
  );
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${highlighted ? "bg-primary/10" : ""}`}>
      <span
        className="w-7 text-right text-sm font-bold tabular-nums text-main"
      >
        {entry.rank}
      </span>
      {entry.userId ? (
        <Link href={`/u/${entry.userId}`} aria-hidden="true" tabIndex={-1} className="shrink-0 rounded-full">
          {rowAvatar}
        </Link>
      ) : (
        rowAvatar
      )}
      {entry.userId ? (
        <Link href={`/u/${entry.userId}`} className="min-w-0 flex-1 truncate text-sm font-medium text-main hover:underline">
          {entry.displayName}
          {highlighted ? <span className="ml-1.5 text-xs font-medium text-primary"> vos</span> : null}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-main">
          {entry.displayName}
          {highlighted ? <span className="ml-1.5 text-xs font-medium text-primary"> vos</span> : null}
        </span>
      )}
      <span className="text-sm font-bold tabular-nums text-main">{value}</span>
    </li>
  );
}

function EmptyRanking({ period }: { period: RankingPeriod }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div>
        <p className="t-title text-base">{emptyRankingMessage(period)}</p>
        <p className="mt-1 text-sm text-muted">Marcá “Estoy acá” en tu lugar y empezás a sumar.</p>
      </div>
      <Link href="/" className="mt-1 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98]">
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
          <div key={index} className="animate-pulse rounded-control bg-[var(--surface-2)]" style={{ height }} />
        ))}
      </div>
      <div className="flex flex-col divide-y divide-[var(--border)] border-y border-app">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex animate-pulse items-center gap-3 px-4 py-3">
            <div className="h-4 w-5 rounded-control bg-[var(--surface-2)]" />
            <div className="h-10 w-10 rounded-full bg-[var(--surface-2)]" />
            <div className="h-3 flex-1 rounded-control bg-[var(--surface-2)]" />
            <div className="h-3 w-12 rounded-control bg-[var(--surface-2)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
