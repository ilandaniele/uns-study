import type { GroupConversationDto } from "@sala/contracts";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { ProBadge } from "@/features/subscriptions/ProBadge";
import { pickDefaultGroup, type RankingScope } from "./scope";

/** "Sala | Mi grupo" segmented control. Locked users see the Pro badge; tapping opens the upsell and keeps the scope. */
export function ScopePicker({
  scope,
  onChange,
  groups,
  locked,
}: {
  scope: RankingScope;
  onChange: (scope: RankingScope) => void;
  groups: GroupConversationDto[] | null;
  locked: boolean;
}) {
  const inGroup = scope.kind === "group";
  const options = [
    { kind: "room" as const, label: "Sala", selected: !inGroup },
    { kind: "group" as const, label: "Mi grupo", selected: inGroup },
  ];

  function choose(kind: "room" | "group") {
    if (kind === "room") return onChange({ kind: "room" });
    if (locked) return openProUpsell("group_ranking");
    onChange({ kind: "group", groupId: (groups && pickDefaultGroup(groups)) ?? "" });
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Ámbito" className="grid grid-cols-2 rounded-lg border border-app bg-[var(--surface-2)] p-1">
        {options.map((option) => (
          <button
            key={option.kind}
            type="button"
            role="radio"
            aria-checked={option.selected}
            onClick={() => choose(option.kind)}
            className={`min-h-9 rounded-control px-3 text-sm font-medium transition-colors duration-150 ${
              option.selected ? "bg-surface text-main" : "text-muted hover:text-main"
            }`}
          >
            {option.label}
            {option.kind === "group" && locked ? (
              <>
                {" "}
                <ProBadge inline />
                <span className="sr-only"> (Pro)</span>
              </>
            ) : null}
          </button>
        ))}
      </div>
      {inGroup && !locked && groups && groups.length > 1 ? (
        <select
          aria-label="Grupo"
          value={scope.groupId}
          onChange={(e) => onChange({ kind: "group", groupId: e.target.value })}
          className="min-h-10 rounded-control border border-app bg-surface px-3 text-sm text-main"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
