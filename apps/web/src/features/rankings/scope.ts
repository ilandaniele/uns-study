import type { GroupConversationDto } from "@sala/contracts";

/** `groupId === ""` means "Mi grupo" is selected but the user has no groups yet. */
export type RankingScope = { kind: "room" } | { kind: "group"; groupId: string };

/** Scope to open with: `?group=<id>` only when that group is one of the user's (never while `groups` is unknown). */
export function initialScope(search: string, groups: readonly { id: string }[] | null): RankingScope {
  const id = new URLSearchParams(search).get("group");
  if (id && groups?.some((g) => g.id === id)) return { kind: "group", groupId: id };
  return { kind: "room" };
}

/** Group with the most recent activity (last message, else creation); the first one on ties. Null when there are none. */
export function pickDefaultGroup(groups: readonly GroupConversationDto[]): string | null {
  let best: GroupConversationDto | null = null;
  let bestAt = "";
  for (const g of groups) {
    const at = g.lastMessageAt ?? g.createdAt;
    if (!best || at > bestAt) {
      best = g;
      bestAt = at;
    }
  }
  return best?.id ?? null;
}
