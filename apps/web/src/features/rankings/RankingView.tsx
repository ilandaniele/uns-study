"use client";

import type { RankingCategory, RankingPeriod } from "@uns/contracts";
import { useState } from "react";
import { RankingTable } from "./RankingTable";
import { RankingTabs } from "./RankingTabs";
import { useRankings } from "./useRankings";

export function RankingView({ roomSlug }: { roomSlug: string }) {
  const [period, setPeriod] = useState<RankingPeriod>("today");
  const [category, setCategory] = useState<RankingCategory>("study_time");
  const { ranking, loading, error } = useRankings(roomSlug, period, category);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-xl font-bold text-slate-900">Ranking</h1>
      <RankingTabs period={period} category={category} onPeriodChange={setPeriod} onCategoryChange={setCategory} />
      {loading ? (
        <p className="p-4 text-sm text-slate-500">Cargando ranking…</p>
      ) : error ? (
        <p className="p-4 text-sm text-red-600">{error}</p>
      ) : ranking ? (
        <RankingTable ranking={ranking} />
      ) : null}
    </main>
  );
}
