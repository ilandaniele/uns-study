import type { ConversationDto, GroupConversationDto } from "@sala/contracts";

export type ChatRow =
  | { kind: "dm"; sortAt: string; conversation: ConversationDto }
  | { kind: "group"; sortAt: string; group: GroupConversationDto };

function time(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Private conversations and groups in one list, newest activity first (stable for ties). A DM without messages sorts last. */
export function mergeChatRows(conversations: readonly ConversationDto[], groups: readonly GroupConversationDto[]): ChatRow[] {
  const rows: ChatRow[] = [
    ...conversations.map((conversation): ChatRow => ({ kind: "dm", sortAt: conversation.lastMessageAt ?? "", conversation })),
    ...groups.map((group): ChatRow => ({ kind: "group", sortAt: group.lastMessageAt ?? group.createdAt, group })),
  ];
  return rows.sort((a, b) => time(b.sortAt) - time(a.sortAt));
}
