import type { RankingCategory, RankingPeriod } from "@uns/contracts";
import { CATEGORY_LABELS, PERIOD_LABELS } from "./labels";

const PERIODS: RankingPeriod[] = ["today", "week", "month", "all"];
const CATEGORIES: RankingCategory[] = ["study_time", "streak", "contribution"];

function TabRow<T extends string>({
  options,
  labels,
  value,
  onChange,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={
            option === value
              ? "rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-white"
              : "rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          }
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

export function RankingTabs({
  period,
  category,
  onPeriodChange,
  onCategoryChange,
}: {
  period: RankingPeriod;
  category: RankingCategory;
  onPeriodChange: (period: RankingPeriod) => void;
  onCategoryChange: (category: RankingCategory) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <TabRow options={PERIODS} labels={PERIOD_LABELS} value={period} onChange={onPeriodChange} />
      <TabRow options={CATEGORIES} labels={CATEGORY_LABELS} value={category} onChange={onCategoryChange} />
    </div>
  );
}
