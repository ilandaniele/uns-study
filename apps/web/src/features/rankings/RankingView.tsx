"use client";

import type { RankingCategory, RankingPeriod } from "@sala/contracts";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { CATEGORY_DESCRIPTIONS } from "./labels";
import { RankingSkeleton, RankingTable } from "./RankingTable";
import { CategoryPicker, PeriodPicker } from "./RankingTabs";
import { useRankings } from "./useRankings";

export function RankingView({ roomSlug }: { roomSlug: string }) {
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const [category, setCategory] = useState<RankingCategory>("study_time");
  const { ranking, loading, error } = useRankings(roomSlug, period, category);

  useEffect(() => {
    trackEvent("ranking_view");
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-24 pt-6 md:pb-10">
      <header>
        <h1 className="t-heading">Ranking</h1>
        <p className="mt-1 text-sm text-muted">{CATEGORY_DESCRIPTIONS[category]}</p>
      </header>
      <div className="flex flex-col gap-2.5">
        <PeriodPicker value={period} onChange={setPeriod} />
        <CategoryPicker value={category} onChange={setCategory} />
      </div>
      {loading && !ranking ? (
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
