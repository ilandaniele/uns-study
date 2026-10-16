"use client";

import type { GroupConversationDto, RankingCategory, RankingPeriod } from "@sala/contracts";
import { useEffect, useState } from "react";
import { openChatWidget } from "@/features/chat/widget-store";
import { proLockState } from "@/features/subscriptions/pro";
import { trackEvent } from "@/lib/analytics";
import { useMe } from "@/lib/me-store";
import { DataPaths } from "@/lib/prefetch";
import { fetchCached, peekCached } from "@/lib/query-cache";
import { CATEGORY_DESCRIPTIONS } from "./labels";
import { RankingSkeleton, RankingTable } from "./RankingTable";
import { CategoryPicker, PeriodPicker } from "./RankingTabs";
import { initialScope, type RankingScope } from "./scope";
import { ScopePicker } from "./ScopePicker";
import { useGroupRanking } from "./useGroupRanking";
import { useRankings } from "./useRankings";

export function RankingView({ roomSlug }: { roomSlug: string }) {
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const [category, setCategory] = useState<RankingCategory>("study_time");
  const [scope, setScope] = useState<RankingScope>({ kind: "room" });
  const [groups, setGroups] = useState<GroupConversationDto[] | null>(null);
  const [wantedGroup, setWantedGroup] = useState<string | null>(null);
  const { me, loading: meLoading } = useMe();
  const lock = proLockState(me, meLoading);
  const showScope = !!me?.user && lock !== "unknown";
  const unlocked = lock === "unlocked";
  const groupId = scope.kind === "group" ? scope.groupId : null;

  const room = useRankings(roomSlug, period, category);
  const group = useGroupRanking(groupId, period, category, unlocked);
  const { ranking, loading, error } = scope.kind === "group" ? group : room;

  useEffect(() => {
    trackEvent("ranking_view");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the query string is only readable on the client
    setWantedGroup(new URLSearchParams(window.location.search).get("group"));
  }, []);

  // The groups list is only needed by Pro users (the scope switch is locked for everyone else).
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    const cached = peekCached<GroupConversationDto[]>(DataPaths.groups());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- render the cached list right away
    if (cached) setGroups(cached);
    fetchCached<GroupConversationDto[]>(DataPaths.groups())
      .then((rows) => {
        if (!cancelled) setGroups(rows);
      })
      .catch(() => {
        if (!cancelled) setGroups((current) => current ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  // Deep link /ranking?group=<id>: applied once, when the list confirms it is one of the user's groups.
  useEffect(() => {
    if (!wantedGroup || !groups) return;
    const next = initialScope(`?group=${encodeURIComponent(wantedGroup)}`, groups);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot deep link resolution
    setWantedGroup(null);
    if (next.kind === "group") setScope(next);
  }, [wantedGroup, groups]);

  const groupName = groupId ? (group.ranking?.groupName ?? groups?.find((g) => g.id === groupId)?.name) : undefined;
  const noGroups = scope.kind === "group" && groups !== null && groups.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-24 pt-6 md:pb-10">
      <header>
        <h1 className="t-heading">Ranking</h1>
        <p className="mt-1 text-sm text-muted">{CATEGORY_DESCRIPTIONS[category]}</p>
      </header>
      <div className="flex flex-col gap-2.5">
        {showScope ? <ScopePicker scope={scope} onChange={setScope} groups={groups} locked={!unlocked} /> : null}
        {groupName ? <p className="text-xs font-medium text-muted">Solo integrantes de {groupName}</p> : null}
        <PeriodPicker value={period} onChange={setPeriod} />
        <CategoryPicker value={category} onChange={setCategory} />
      </div>
      {noGroups ? (
        <div className="flex flex-col items-start gap-2 border-y border-app py-4">
          <p className="text-sm text-muted">Todavía no tenés grupos. Armá uno con tus amigos para compararse.</p>
          <button
            type="button"
            onClick={() => openChatWidget({ view: "list" })}
            className="inline-flex min-h-10 items-center rounded-control bg-primary px-4 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98]"
          >
            Crear un grupo
          </button>
        </div>
      ) : scope.kind === "group" && group.proRequired ? (
        <p className="border-y border-app py-4 text-sm text-muted">El ranking entre amigos es parte de Pro.</p>
      ) : (scope.kind === "group" && !groupId) || (loading && !ranking) ? (
        <RankingSkeleton />
      ) : error ? (
        <p className="border-y border-app py-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : ranking ? (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <RankingTable ranking={ranking} />
        </div>
      ) : null}
    </main>
  );
}
