"use client";

import type { RankingCategory, RankingPeriod } from "@uns/contracts";
import { useState } from "react";
import { CATEGORY_DESCRIPTIONS } from "./labels";
import { RankingSkeleton, RankingTable } from "./RankingTable";
import { CategoryPicker, PeriodPicker } from "./RankingTabs";
import { useRankings } from "./useRankings";

export function RankingView({ roomSlug }: { roomSlug: string }) {
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const [category, setCategory] = useState<RankingCategory>("study_time");
  const { ranking, loading, error } = useRankings(roomSlug, period, category);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-24 pt-6 md:pb-10">
      <header>
        <h1 className="font-display text-[22px] font-extrabold uppercase leading-none tracking-[0.01em] text-main">Ranking</h1>
        <p className="mt-1 text-sm text-muted">{CATEGORY_DESCRIPTIONS[category]}</p>
      </header>
      <div className="flex flex-col gap-2.5">
        <PeriodPicker value={period} onChange={setPeriod} />
        <CategoryPicker value={category} onChange={setCategory} />
      </div>
      {loading && !ranking ? (
        <RankingSkeleton />
      ) : error ? (
        <p className="rounded-2xl border border-app bg-surface p-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : ranking ? (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <RankingTable ranking={ranking} />
        </div>
      ) : null}
    </main>
  );
}
