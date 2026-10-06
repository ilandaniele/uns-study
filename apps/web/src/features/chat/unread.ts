import type { ChatMessageDto } from "@sala/contracts";

/** True when the caller wrote the message (REST marks it `mine`; broadcasts carry only the author id). */
export function isOwnMessage(message: ChatMessageDto, currentUserId: string | null): boolean {
  return message.mine === true || (currentUserId !== null && message.author.userId === currentUserId);
}

/** Room messages from other people posted after `lastSeenAt` (ISO). Deleted messages don't count. */
export function countUnread(messages: ChatMessageDto[], lastSeenAt: string | null, currentUserId: string | null): number {
  if (!lastSeenAt) return 0;
  const seen = Date.parse(lastSeenAt);
  return messages.filter((m) => !m.deleted && !isOwnMessage(m, currentUserId) && Date.parse(m.createdAt) > seen).length;
}

/** Badge text: counts above 99 collapse to "99+". */
export function formatUnread(count: number): string {
  return count > 99 ? "99+" : String(count);
}
