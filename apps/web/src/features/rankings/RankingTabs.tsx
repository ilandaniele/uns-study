import type { RankingCategory, RankingPeriod } from "@uns/contracts";
import { ClockIcon, FireIcon, HandHeartIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { CATEGORY_LABELS, PERIOD_LABELS } from "./labels";

const PERIODS: RankingPeriod[] = ["today", "week", "month", "all"];
const CATEGORIES: { value: RankingCategory; icon: ReactNode }[] = [
  { value: "study_time", icon: <ClockIcon size={18} weight="bold" aria-hidden="true" /> },
  { value: "streak", icon: <FireIcon size={18} weight="bold" aria-hidden="true" /> },
  { value: "contribution", icon: <HandHeartIcon size={18} weight="bold" aria-hidden="true" /> },
];

/** Category picker: three equal cells, the main choice of the page. */
export function CategoryPicker({ value, onChange }: { value: RankingCategory; onChange: (value: RankingCategory) => void }) {
  return (
    <div role="radiogroup" aria-label="Qué medir" className="grid grid-cols-3 gap-2">
      {CATEGORIES.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-2 text-sm font-semibold transition active:scale-[0.98] ${
              selected
                ? "border-transparent bg-primary text-white shadow-sm"
                : "border-app bg-surface text-main hover:bg-[var(--surface-2)]"
            }`}
          >
            {option.icon}
            <span className="truncate">{CATEGORY_LABELS[option.value]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Period picker: a compact segmented control, secondary to the category. */
export function PeriodPicker({ value, onChange }: { value: RankingPeriod; onChange: (value: RankingPeriod) => void }) {
  return (
    <div role="radiogroup" aria-label="Período" className="grid grid-cols-4 rounded-full border border-app bg-[var(--surface-2)] p-1">
      {PERIODS.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={`min-h-9 rounded-full px-3 text-sm font-medium transition ${
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
