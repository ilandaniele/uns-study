import type { RankingCategory, RankingPeriod } from "@sala/contracts";
import { ClockIcon, FireIcon, HandHeartIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { CATEGORY_LABELS, PERIOD_LABELS } from "./labels";

const PERIODS: RankingPeriod[] = ["today", "week", "month", "all"];
const CATEGORIES: { value: RankingCategory; icon: ReactNode }[] = [
  { value: "study_time", icon: <ClockIcon size={16} weight="bold" aria-hidden="true" /> },
  { value: "streak", icon: <FireIcon size={16} weight="bold" aria-hidden="true" /> },
  { value: "contribution", icon: <HandHeartIcon size={16} weight="bold" aria-hidden="true" /> },
];

/** Period picker: the primary choice, a clean full-width segmented control. */
export function PeriodPicker({ value, onChange }: { value: RankingPeriod; onChange: (value: RankingPeriod) => void }) {
  return (
    <div role="radiogroup" aria-label="Período" className="grid grid-cols-4 rounded-lg border border-app bg-[var(--surface-2)] p-1">
      {PERIODS.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={`min-h-9 rounded-md px-3 text-sm font-medium transition ${
              selected ? "bg-surface text-main shadow-sm" : "text-muted hover:text-main"
            }`}
          >
            {PERIOD_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

/** Category picker: a secondary row of small pill chips (not full-width, unlike the period control). */
export function CategoryPicker({ value, onChange }: { value: RankingCategory; onChange: (value: RankingCategory) => void }) {
  return (
    <div role="radiogroup" aria-label="Qué medir" className="flex flex-wrap gap-2">
      {CATEGORIES.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98] ${
              selected
                ? "border-transparent bg-primary text-white shadow-sm"
                : "border-app bg-surface text-main hover:bg-[var(--surface-2)]"
            }`}
          >
            {option.icon}
            {CATEGORY_LABELS[option.value]}
          </button>
        );
      })}
    </div>
  );
}
